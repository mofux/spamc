/**
 * Author: Carl Glaysher
 * Date Created: 17/03/2012
 * Description: Module to emulate SPAMC client in a node way
 * Available Commands:
 *
 *  ping - returns boolean
 *  check - returns object
 *  symbols - returns object with matches
 *  report  - returns objects with matches and descriptions
 *  reportIfSpam - returns object with matches and descriptions
 *  process - returns object with modified message
 *  headers - returns object with modified headers only
 *  learn - TELL spamassassin message is Spam or Ham
 *  tell - TELL spamassassin message is Spam
 *  revoke - remove Spammed Message as being spam from spamassassin
 *
 */
var net = require('net');

var spamc = function (host, port, timeout) {
    var self = this;
    var protocolVersion = 1.5;
    var host = (host == undefined) ? '127.0.0.1' : host;
    var port = (port == undefined) ? 783 : port;
    var connTimoutSecs = (timeout == undefined) ? 10 : timeout;
    /*
     * Description: Sends a Ping to spamd and returns Pong on response
     * Param: onResponse {function}
     * Returns: self
     */
    this.ping = function(onResponse){
        exec('PING',null,function(data){
            /* Check Response has the word PONG */
            if(data[0].indexOf('PONG')>0){
                onResponse(true);
            }else{
                onResponse(false);
            }
        });
        return self;
    };
    /*
     * Description: returns spam score
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.check = function(message,onResponse){
        exec('CHECK',message,function(data){
            var response = processResponse('CHECK',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };
    /*
     * Description: Returns Spam Score and Matches
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.symbols = function(message,onResponse){
        exec('SYMBOLS',message,function(data){
            var response = processResponse('SYMBOLS',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };
    /*
     * Description: Returns an object report
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.report = function(message,onResponse){
        exec('REPORT',message,function(data){
            var response = processResponse('REPORT',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };
    /*
     * Description: Returns Object Report if is spam
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.reportIfSpam = function(message,onResponse){
        exec('REPORT_IFSPAM',message,function(data){
            var response = processResponse('REPORT_IFSPAM',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };
    /*
     * Description: Returns back a report for the message + the message
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.process = function(message,onResponse){
        exec('PROCESS',message,function(data){
            var response = processResponse('PROCESS',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };
    /*
     * Description: Returns headers for the message
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.headers = function(message,onResponse){
        exec('HEADERS',message,function(data){
            var response = processResponse('HEADERS',data);
            if(typeof(onResponse)=='function') onResponse(response);
        });
        return self;
    };

    /*
     * Description: Tell spamd to learn message is spam/ham or forget
     * Param: message {string}
     * Param: learnType {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.learn = function(message,learnType,onResponse){
        var headers;
        switch(learnType.toUpperCase()){
            case 'SPAM':
                headers=[
                    {name:'Message-class','value':'spam'},
                    {name:'Set','value':'local'}
                ];
                break;
            case 'HAM':
            case 'NOTSPAM':
            case 'NOT_SPAM':
                headers=[
                    {name:'Message-class','value':'ham'},
                    {name:'Set','value':'local'}
                ];
                break;
            case 'FORGET':
                headers=[
                    {name:'Remove','value':'local'}
                ];
                break;
            default:
                throw new Error('Learn Type Not Found');
        }
        exec('TELL',message,function(data){
            var response = processResponse('HEADERS',data);
            if(response.responseCode==69){
                throw new Error('TELL commands are not enabled, set the --allow-tell switch.');
            }
            if(typeof(onResponse)=='function') onResponse(response);
        },headers);
        return self;
    };
    /*
     * Description: tell spamd message is not spam
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.revoke = function(message,onResponse){
        headers=[
            {name:'Message-class','value':'ham'},
            {name:'Set','value':'local,remote'}
        ];
        exec('TELL',message,function(data){
            var response = processResponse('HEADERS',data);
            if(response.responseCode==69){
                throw new Error('TELL commands are not enabled, set the --allow-tell switch.');
            }
            if(typeof(onResponse)=='function') onResponse(response);
        },headers);
        return self;
    };
    /*
     * Description: Tell spamd message is spam
     * Param: message {string}
     * Param: onResponse {function}
     * Returns: self
     */
    this.tell = function(message,onResponse){
        headers=[
            {name:'Message-class','value':'spam'},
            {name:'Set','value':'local,remote'}
        ];
        exec('TELL',message,function(data){
            var response = processResponse('HEADERS',data);
            if(response.responseCode==69){
                throw new Error('TELL commands are not enabled, set the --allow-tell switch.');
            }
            if(typeof(onResponse)=='function') onResponse(response);
        },headers);
        return self;
    };
    /*
     * Description: Sends a command to spamd
     * Param: cmd {string}
     * Param: message {string}
     * Param: onData {function(data)}
     */
    var exec = function(cmd,message,onData,extraHeaders){
        var responseData = [];
        var stream = net.createConnection(port,host);
        stream.setTimeout(connTimoutSecs*1000,function(){
            throw new Error('Connection to spamd Timed Out');
        });
        stream.on('connect',function(){
            /* Create Command to Send to spamd */
            cmd = cmd+" SPAMC/"+protocolVersion+"\r\n";
            if(typeof(message)=='string'){
                message = message+'\r\n';
                cmd = cmd+"Content-length: "+(message.length)+"\r\n";
                /* Process Extra Headers if Any */
                if(typeof(extraHeaders)=='object'){
                    for(var i=0;i<extraHeaders.length;i++){
                        cmd = cmd+extraHeaders[i].name+": "+extraHeaders[i].value+"\r\n";
                    }
                }
                cmd = cmd+"\r\n"+message;
            }
            stream.write(cmd+"\r\n");
        });
        stream.on('error',function(data){
            throw new Error('spamd returned a error: '+data.toString());
        });
        stream.on('data',function(data){
            var data = data.toString();
            /* Remove Last new Line and Return and Split Lines into Array */
            data = data.split("\r\n");
            for(var i=0;i<data.length;i++){
                if(data[i].length>0){
                    responseData[responseData.length]=data[i];
                }
            }
        });
        stream.on('close',function(){
            onData(responseData);
        })
    };
    /*
     * Description: Processes Response from spamd and put into a formatted object
     * Param: cmd {string}
     * Param: lines {array[string]}
     * Return: {object}
     */
    var processResponse = function(cmd,lines){
        var returnObj = {};
        var result = lines[0].match(/SPAMD\/([0-9\.]+)\s([0-9]+)\s([0-9A-Z_]+)/);
        if(result==null){
            throw new Error('spamd unreconized response:'+lines[0]);
        }
        returnObj.responseCode = parseInt(result[2]);
        returnObj.responseMessage = result[3];
        if(cmd=='TELL'){
            returnObj.didSet=false;
            returnObj.didRemove=false;
        }
        for(var i=0;i<lines.length;i++){
            var result = lines[i].match(/Spam:\s(True|False|Yes|No)\s;\s([0-9\.]+)\s\/\s([0-9\.]+)/);
            if(result!=null){
                returnObj.isSpam =false;
                if(result[1]=='True' || result[1]=='Yes'){
                    returnObj.isSpam = true;
                }
                returnObj.spamScore = parseFloat(result[2]);
                returnObj.baseSpamScore = parseFloat(result[3]);
            }
            if(result==null){
                var result = lines[i].match(/([A-Z0-9\_]+)\,/g);
                if(result!=null){
                    returnObj.matches =[];
                    for(var ii=0;ii<result.length;ii++){
                        returnObj.matches[ii] = result[ii].substring(0,result[ii].length-1);
                    }
                }
            }
            if(result==null && cmd!='PROCESS'){
                var pattern = /(\s|-)([0-9\.]+)\s([A-Z0-9\_]+)\s([^:]+)\:\s([^\n]+)/g;
                var result = lines[i].match(pattern);
                if(result!=null){
                    returnObj.report =[];
                    for(var ii=0;ii<result.length;ii++){
                        /* Remove New Line if Found */
                        result[ii] = result[ii].replace(/\n([\s]*)/, ' ');
                        /* Match Sections */
                        var pattern = /(\s|-)([0-9\.]+)\s([A-Z0-9\_]+)\s([^:]+)\:\s([^\s]+)/;
                        var matches = result[ii].match(pattern);
                        returnObj.report[returnObj.report.length] = {
                            score:matches[2],
                            name:matches[3],
                            description:matches[4].replace(/^\s*([\S\s]*)\b\s*$/, '$1'),
                            type:matches[5]
                        };
                    }
                }

            }
            if(lines[i].indexOf('DidSet:')>=0){
                returnObj.didSet=true;
            }
            if(lines[i].indexOf('DidRemove:')>=0){
                returnObj.didRemove=true;
            }
        }
        if(cmd=='PROCESS'){
            returnObj.message = '';
            for(var i=3;i<lines.length;i++){
                returnObj.message=returnObj.message+lines[i]+"\r\n";
            }
        }
        if(cmd=='HEADERS'){
            returnObj.headers = [];
            for(var i=3;i<lines.length;i++){
                if(lines[i].indexOf('\t')<0){
                    returnObj.headers[returnObj.headers.length]=lines[i];
                }else{
                    returnObj.headers[returnObj.headers.length-1]=returnObj.headers[returnObj.headers.length-1]+lines[i];
                }
            }
        }

        return returnObj;
    };
};

module.exports = spamc;

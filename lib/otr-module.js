(function () {

  var root = this

/*
 *  Off-the-Record Messaging bindings for node/javascript
 *  Copyright (C) 2012  Mokhtar Naamani,
 *                      <mokhtar.naamani@gmail.com>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of version 2 of the GNU General Public License as
 *  published by the Free Software Foundation.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */



var debug = function(){};

var otr, otrBindings, util, events;

if (typeof exports !== 'undefined') {

    otrBindings = require("./libotr-js-bindings.js");
    util = require('util');
    events = require('events');
    module.exports = OTR;
    
}else{

    otrBindings = root.otrBindings;
    root.OTR = OTR;
    events = undefined;
}

    otr = new otrBindings();

    if(otr.version()!="3.2.1-emscripten"){
    	console.error("Warning. Excpecting libotr3.2.1-emscripten!");
        process.exit();
    }

function OTR(){
}

OTR.prototype = {
    constructor: OTR,
    debugOn: function(){
        debug = console.error;
    },
    debugOff: function(){
        debug = function(){};
    },
    version: otr.version,
    UserState: otr.UserState,
    ConnContext: otr.ConnContext,
    //discourage use of MessageAppOps
    //MessageAppOps : otr.MessageAppOps,
    User: User,
    OTRChannel: OTRChannel,
    Session : OTRChannel,// better name 
    POLICY: POLICY,
    VFS: otr.VFS
};

if(util && events) util.inherits(OTRChannel, events.EventEmitter);

function User( config ){
    this.name = config.name;    
    this.state = new otr.UserState();
    this.keys = config.keys;
    this.fingerprints = config.fingerprints;
    try{    
        this.state.readKeysSync(this.keys);
    }catch(e){ console.error("Warning Reading Keys:",e);}
    try{
        this.state.readFingerprintsSync(this.fingerprints);
    }catch(e){ console.error("Warning Reading Fingerprints:",e);}
}
User.prototype.accounts = function(){
    return this.state.accounts();
};
User.prototype.generateKey = function(accountname,protocol,callback){
    this.state.generateKey(this.keys,accountname,protocol,callback);
};
User.prototype.findKey = function(accountname,protocol){
    return this.state.findKey(accountname,protocol);
};
User.prototype.deleteKey = function(accountname,protocol){
    this.state.deleteKeyOnFile(this.keys,accountname,protocol);
};
User.prototype.ConnContext = function(accountname, protocol, recipient){    
    return new otr.ConnContext(this.state,accountname,protocol,recipient);
};

User.prototype.writeFingerprints = function(){
    console.error("Writing Fingerprints to:",this.fingerprints);
    this.state.writeFingerprintsSync(this.fingerprints);
};

function OTRChannel(user, context, parameters){
    if(events) {
        events.EventEmitter.call(this);
    }else{
        this._events = {};
    }

    this.user = user;
    this.context = context;
    this.parameters = parameters;
    this.ops = new otr.MessageAppOps( OtrEventHandler(this) );
}

if(!events){
  //simple events API for use in the browser
  OTRChannel.prototype.on = function(e,cb){
    //used to register callbacks
    //store event name e in this._events 
    this._events[e] ? this._events[e].push(cb) : this._events[e]=[cb];

  };
  OTRChannel.prototype.emit = function(e){
    //used internally to fire events
    //'apply' event handler function  to 'this' channel pass eventname 'e' and arguemnts.slice(1)
    var self = this;
    var args = Array.prototype.slice.call(arguments);

    if(this._events && this._events[e]){
        this._events[e].forEach(function(cb){
            cb.apply(self,args.length>1?args.slice(1):[undefined]);
        });
    }
  };
}

OTRChannel.prototype.connect = function(){
    return this.send("");
};
OTRChannel.prototype.send = function(message){
    //message can be any object that can be serialsed to a string using it's .toString() method.   
    var msgout, err;
    msgout = this.ops.messageSending(this.user.state, this.context.accountname(), this.context.protocol(), this.context.username(), message.toString());
    if(msgout){
       err=this.ops.fragmentAndSend(this.context,msgout);
       return err;
    }
};
OTRChannel.prototype.recv = function(message){
    //message can be any object that can be serialsed to a string using it's .toString() method.
    var msg = this.ops.messageReceiving(this.user.state, this.context.accountname(), this.context.protocol(), this.context.username(), message.toString());
    if(msg) this.emit("message",msg);
};
OTRChannel.prototype.close = function(){
    this.ops.disconnect(this.user.state,this.context.accountname(),this.context.protocol(),this.context.username());
    this.emit("shutdown");
};
OTRChannel.prototype.start_smp = function(secret){
    var sec = secret || this.parameters? this.parameters.secret:undefined || undefined;
    if(!sec) throw( new Error("No Secret Provided"));
    this.ops.initSMP(this.user.state, this.context, sec);
};

OTRChannel.prototype.start_smp_question = function(question,secret){
    if(!question){
        throw(new Error("No Question Provided"));        
    }
    var sec = secret;
    if(!sec){
        sec = this.parameters ? this.parameters.secrets : undefined;
        if(!sec) throw(new Error("No Secrets Provided"));
        sec = sec[question];        
    }    
    
    if(!sec) throw(new Error("No Secret Matched for Question"));
   
    this.ops.initSMP(this.user.state, this.context, sec,question);
};

OTRChannel.prototype.respond_smp = function(secret){
    var sec = secret ? secret : undefined;
    if(!sec){
        sec = this.parameters ? this.parameters.secret : undefined;
    }
    if(!sec) throw( new Error("No Secret Provided"));    
    this.ops.respondSMP(this.user.state, this.context, sec);
};
OTRChannel.prototype.isEncrypted = function(){
    return (this.context.msgstate()===1);
};
OTRChannel.prototype.isAuthenticated = function(){
    return (this.context.trust()==="smp");
};

function OtrEventHandler( otrChannel ){
 function emit(){
    otrChannel.emit.apply(otrChannel,arguments);
 }
 return (function(o){
    //console.error(o.EVENT);
    switch(o.EVENT){
        case "smp_request":
            if(o.question) debug("SMP Question:"+o.question);
            emit(o.EVENT,o.question);
            return;
        case "smp_complete":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "smp_failed":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "smp_aborted":
            debug(o.EVENT);
            emit(o.EVENT);
            return;        
        case "is_logged_in":
            //TODO:function callback. for now remote party is always assumed to be online
            return 1;
        case "gone_secure":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "gone_insecure":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "remote_disconnected":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "policy":                  
            if(!otrChannel.parameters) return POLICY("DEFAULT");
            if(typeof otrChannel.parameters.policy == 'number' ) return otrChannel.parameters.policy;//todo: validate policy
            return POLICY("DEFAULT");
        case "update_context_list":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "max_message_size":
            if(!otrChannel.parameters) return 0; //default to no fragmentation if not specified
            return otrChannel.parameters.MTU || 0; //default to no fragmentation
        case "inject_message":
            //debug("INJECT:"+o.message);
            emit(o.EVENT,o.message);
            return;
        case "create_privkey":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        case "display_otr_message":
            debug("OTR_MESSAGE:"+o.message);
            emit(o.EVENT,o.message);
            return;            
        case "notify":
            debug("OTR_NOTIFY:"+o.title+"-"+o.primary);
            emit(o.EVENT,o.title,o.primary,o.secondary);
            return;
        case "log_message":
            debug("OTR DEBUG:"+o.message);
            emit(o.EVENT,o.message);
            return;
        case "new_fingerprint":
            debug("NEW FINGERPRINT: "+o.fingerprint);
            emit(o.EVENT,o.fingerprint);
            return;
        case "write_fingerprints":
            debug(o.EVENT);
            otrChannel.user.writeFingerprints();
            return;
        case "still_secure":
            debug(o.EVENT);
            emit(o.EVENT);
            return;
        default:
            console.error("UNHANDLED EVENT:",o.EVENT);
            return;
    }
 });
}

/* --- libotr-3.2.1/src/proto.h   */
var _policy = {
    'NEVER':0x00,
    'ALLOW_V1': 0x01,
    'ALLOW_V2': 0x02,
    'REQUIRE_ENCRYPTION': 0x04,
    'SEND_WHITESPACE_TAG': 0x08,
    'WHITESPACE_START_AKE': 0x10,
    'ERROR_START_AKE': 0x20
};

_policy['VERSION_MASK'] = _policy['ALLOW_V1']|_policy['ALLOW_V2'];
_policy['OPPORTUNISTIC'] =  _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['SEND_WHITESPACE_TAG']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['MANUAL'] = _policy['ALLOW_V1']|_policy['ALLOW_V2'];
_policy['ALWAYS'] = _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['REQUIRE_ENCRYPTION']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['DEFAULT'] = _policy['OPPORTUNISTIC']

function POLICY(p){  
    return _policy[p];
};



})(this);

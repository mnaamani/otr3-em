;(function () {

  var root = this

  var libModule, ASYNC, fs, BigInt;

  if (typeof exports !== 'undefined') {
    libModule = require("./libotr3.js").getModule();
    ASYNC = require("./async");
    fs = require("fs");
    BigInt = require("./bigint.js");
    module.exports = otrBindings;

  } else {
    libModule = root.getModule();
    ASYNC = root.async;
    fs = undefined;//local storage?
    BigInt = root.BigInt;
    root.otrBindings = otrBindings;
  }

//exported C functions
var otrl_ = libModule.libotrl; //cwrap()'ed functions from libotr
var gcry_ = libModule.libgcrypt; //cwrap()'ed functions from libgcrypt
var jsapi_= libModule.jsapi; //cwrap()'ed helper functions

//some emscripten helper functions for accessing memory/HEAP 
var _malloc = libModule.malloc;
var _free = libModule.free;
var getValue = libModule.getValue;
var setValue = libModule.setValue;
var Pointer_stringify = libModule.Pointer_stringify;

//exposing some objects to code living in libotr3.js 
libModule["ops_event"] = ops_event;
libModule["ConnContext"] = OtrlConnContext;

var OPS_QUEUE;
var MAO = []; //OtrlMessageAppOps instances and their callback handlers

//otrBindings = Exported Interface
function otrBindings(){
    this.init();
};

otrBindings.prototype = {

    constructor: otrBindings,

    init : jsapi_.initialise, //put this in jsapi.c main() instead?

    UserState : OtrlUserState,

    ConnContext : OtrlConnContext,

    MessageAppOps : OtrlMessageAppOps,

    VFS : VirtualFileSystem,

    version :function(){
        return otrl_.version()+"-emscripten";
    }
};

//OtrlPrivKey
function OtrlPrivKey(ptr){
    this._pointer = ptr;
};
OtrlPrivKey.prototype.next = function(){
    var ptr = jsapi_.privkey_get_next(this._pointer);
    if(ptr) return new OtrlPrivKey(ptr);
    return undefined;
};
OtrlPrivKey.prototype.accountname = function(){
    return jsapi_.privkey_get_accountname(this._pointer);
};
OtrlPrivKey.prototype.protocol = function(){
    return jsapi_.privkey_get_protocol(this._pointer);
};
OtrlPrivKey.prototype.forget = function(){
    otrl_.privkey_forget(this._pointer);
    this._pointer = 0;
};
OtrlPrivKey.prototype.export = function( format ){
    var self = this;
    var buffer = _malloc(1024);
    var nbytes_ptr = _malloc(4);
    var nbytes = 0;    
    var dsakey = {};
    var err = 0;
    ['p','q','g','y','x'].forEach(function(token){
        err = jsapi_.privkey_print_token(self._pointer,token,buffer,1024,nbytes_ptr);
        if(!err){
            nbytes = getValue(nbytes_ptr);
            if(nbytes){
                dsakey[token] = Pointer_stringify( buffer );
            }
        }else{
            console.error("error exporting key:", gcry_.strerror(err) );
        }
    });
    _free(buffer);
    _free(nbytes_ptr);
    if(format == "BIGINT") {
        ['p','q','g','y','x'].forEach(function(token){
            dsakey[token] = BigInt.str2bigInt( dsakey[token], 16);
        });
    }
    dsakey.type = '\u0000\u0000';

    return dsakey;
};
//OtrlUserState
function OtrlUserState(){
    this._pointer = otrl_.userstate_create();
};
OtrlUserState.prototype.free = function(){
    otrl_.userstate_free(this._pointer);
};
OtrlUserState.prototype.privkey_root = function(){
    var ptr=jsapi_.userstate_get_privkey_root(this._pointer);
    if(ptr) return new OtrlPrivKey(ptr);
    return undefined;
};
OtrlUserState.prototype.accounts = function(){
    var p = this.privkey_root();
    var accounts = [];
    var accountname,protocol;
    var self = this;
    while(p){
        accountname = p.accountname();
        protocol = p.protocol();
        accounts.push({            
            "accountname":accountname,
            "protocol":protocol,
            "fingerprint":self.fingerprint(accountname,protocol)
        });
        p = p.next();
    }
    return accounts;
};
OtrlUserState.prototype.generateKey = function(filename,accountname,protocol,callback){    
    var self = this;
    //cant do this async in pure JS. in a browser we could use web workers..background iframe??
    //in titanium we can create multiple contexts...
    if(typeof filename == 'string' && typeof accountname=='string' && typeof protocol=='string' && typeof callback == 'function'){
      console.log("generating key for:",accountname," protocol:",protocol);
      var err = otrl_.privkey_generate(this._pointer,filename,accountname,protocol);
      try{                
        callback.apply(self, [err ? gcry_.strerror(err) : null, err?undefined:this.findKey(accountname,protocol)] );
        //callback(err?gcry._strerror(err):null);
      }catch(e){
        console.error("Fatal Exception -",e);
      }
    }else{
        throw("invalid arguments to generateKey()");
    }
};
OtrlUserState.prototype.fingerprint = function(accountname, protocol){
    if( typeof accountname =='string' && typeof protocol == 'string'){
        var fp = _malloc(45);
        var res = otrl_.privkey_fingerprint(this._pointer,fp,accountname,protocol);
        var human = (res? Pointer_stringify(fp):undefined);
        _free(fp);
        return human;
    }else{
        throw("invalid arguments to fingerprint()");
    }
};
OtrlUserState.prototype.readKeysSync = function(filename){
    //todo: can also take a string as file contents... url etc.. read it into
    //virtual file system and load into userstate...
    //or access real file system... ?
    if(typeof filename=='string'){
        var err = otrl_.privkey_read(this._pointer,filename);
        return (err?gcry_.strerror(err):null);
    }else{
        throw("invalid arguments to readKeysSync()");
    }
};
OtrlUserState.prototype.readFingerprintsSync = function(filename){
    if(typeof filename == 'string'){
        var err = otrl_.privkey_read_fingerprints(this._pointer,filename,0,0);
        return (err?gcry_.strerror(err):undefined);
    }else{
        throw("invalid arguments to readFingerprintsSync()");
    }
};
OtrlUserState.prototype.writeFingerprintsSync = function (filename){
    if(typeof filename == 'string'){    
        var err = otrl_.privkey_write_fingerprints(this._pointer,filename);
        return (err?gcry_.strerror(err):undefined);
    }else{
        throw("invalid arguments to writeFingerprintsSync()");
    }
};

OtrlUserState.prototype.readKeys = function(){
    throw("use 'readKeysSync()' not 'readKeys()'");
};
OtrlUserState.prototype.readFingerprints = function (){
    throw("use 'readFingerprintsSync()' not 'readFingerprints()'");
};
OtrlUserState.prototype.writeFingerprints = function (){
    throw("use 'writeFingerprintsSync' not 'writeFingerprints()'");
};
OtrlUserState.prototype.findKey = function(accountname,protocol){
    var ptr = otrl_.privkey_find(this._pointer,accountname,protocol);
    if(ptr) return new OtrlPrivKey(ptr);
    return undefined;
};
OtrlUserState.prototype.forgetAllKeys = function(){
    otrl_.privkey_forget_all(this._pointer);
};
OtrlUserState.prototype.deleteKeyOnFile = function(filename,accountname,protocol){
    //make sure that they key exists in userstate
    var key = this.findKey(accountname,protocol);
    if(key) {
        //write out all keys in userstate except key to be deleted.
        jsapi_.privkey_delete(this._pointer,filename,accountname,protocol);
        key.forget();//remove it from userstate
    }
};


//OtrlConnContext
function OtrlConnContext(userstate,accountname,protocol,recipient){
    if( typeof userstate == 'object' &&
        typeof accountname == 'string' &&
        typeof protocol == 'string' &&
        typeof recipient == 'string' ){

        var addedp_addr = _malloc(4); //allocate(1, "i32", ALLOC_STACK);
        this._pointer = otrl_.context_find(userstate._pointer,recipient,accountname,protocol,1,addedp_addr,0,0);
        _free(addedp_addr);
    }else{
        if(arguments.length==1 && typeof arguments[0]=='number'){
            //assume arguments[0] == pointer to existing context;
            this._pointer = arguments[0];
        }else{
            throw("invalid arguments to OtrlConnContext()");
        }
    }
};

OtrlConnContext.prototype.protocol = function(){
    return jsapi_.conncontext_get_protocol(this._pointer);
};
OtrlConnContext.prototype.username = function(){
    return jsapi_.conncontext_get_username(this._pointer);
};
OtrlConnContext.prototype.accountname = function(){
    return jsapi_.conncontext_get_accountname(this._pointer);
};
OtrlConnContext.prototype.msgstate = function(){
    return jsapi_.conncontext_get_msgstate(this._pointer);
};
OtrlConnContext.prototype.protocol_version = function(){
    return jsapi_.conncontext_get_protocol_version(this._pointer);
};
OtrlConnContext.prototype.smstate = function(){
    return jsapi_.conncontext_get_smstate(this._pointer);
};
OtrlConnContext.prototype.fingerprint = function(){
    var fp = _malloc(45);
    jsapi_.conncontext_get_active_fingerprint(this._pointer,fp);
    var human =  Pointer_stringify(fp);
    _free(fp);
    return human;
};
OtrlConnContext.prototype.trust = function(){
    return jsapi_.conncontext_get_trust(this._pointer);
};
OtrlConnContext.prototype.obj = function(){
    return({
        'protocol':this.protocol(),
        'username':this.username(),
        'accountname':this.accountname(),
        'msgstate':this.msgstate(),
        'protocol_version':this.protocol_version(),
        'smstate':this.smstate(),
        'fingerprint':this.fingerprint(),
        'trust':this.trust()
    });
};
OtrlConnContext.prototype.fields = OtrlConnContext.prototype.obj;

//OtrlMessageAppOps
function OtrlMessageAppOps( event_handler ){
    //keep track of all created instances
    //index into array will be passed around as opdata to tie
    //the event_handler to the relevant instance.
    if(!OPS_QUEUE) OPS_QUEUE = ASYNC.queue(ops_handle_event,1)

    var self = this;

    MAO.push({
        instance:self,
    });
    this._event_handler = event_handler;
    this._opsdata = _malloc(4);
    setValue(this._opsdata,MAO.length-1,"i32");
    this._pointer = jsapi_.messageappops_new();
};

function ops_handle_event(O,callback){
    var instance = O._;
    delete O._;
    instance._event_handler(O);
    callback();
}

OtrlMessageAppOps.prototype.messageSending = function(userstate,accountname,protocol,recipient,message){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof recipient=='string' &&
        typeof message=='string'
    )){
        throw("invalid arguments to messageSending()");
    }
    var retvalue;
    var messagep_ptr = _malloc(4);//char**

    var err = otrl_.message_sending(userstate._pointer,this._pointer,this._opsdata,accountname,protocol,recipient,message,0,messagep_ptr,0,0);
    var messagep = getValue(messagep_ptr,"i32");

    if(err){
        retvalue = undefined;
    }else{
        retvalue = Pointer_stringify(messagep);
    }
    if(messagep != 0 ) otrl_.message_free(messagep);
    _free(messagep_ptr);
    return retvalue;
};
OtrlMessageAppOps.prototype.messageReceiving = function(userstate,accountname,protocol,sender,message){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof sender=='string' &&
        typeof message=='string'
    )){
        throw("invalid arguments to messageReceiving()");
    }
    
    var newmessagep_ptr = _malloc(4); //char**
	var status = jsapi_.message_receiving(userstate._pointer,this._pointer,this._opsdata,accountname,protocol,sender,message,newmessagep_ptr);
	var newmessagep = getValue(newmessagep_ptr,"i32");//char*

    var retvalue;
    if(status==1) retvalue = null;
    if(status==0) {
        retvalue = (newmessagep==0) ? message : Pointer_stringify(newmessagep);
    }
    if(newmessagep!=0) otrl_.message_free(newmessagep);
    _free(newmessagep_ptr);
    //console.log("messageReceiving returning from", sender,"with value", retvalue,"status=",status);
    return retvalue;
};
OtrlMessageAppOps.prototype.fragmentAndSend = function(context,message){
    if(!(
        typeof context=='object' &&
        typeof message=='string'
    )){
        throw("invalid arguments to fragmentAndSend()");
    }
   var err =  otrl_.message_fragment_and_send(this._pointer,this._opsdata,context._pointer,message,0,0);//send all fragments
   return gcry_.strerror(err);
};
OtrlMessageAppOps.prototype.disconnect = function(userstate,accountname,protocol,recipient){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof recipient=='string'
    )){
        throw("invalid arguments to disconnect()");
    }

    otrl_.message_disconnect(userstate._pointer,this._pointer,this._opsdata, accountname,protocol,recipient);  
};
OtrlMessageAppOps.prototype.initSMP = function(userstate,context,secret,question){
    if(!(
        typeof userstate=='object' &&
        typeof context=='object' &&
        typeof secret=='string'
    )){
        throw("invalid arguments to initSMP()");
    }

    if(jsapi_.can_start_smp(context._pointer)){
        if(question){
            otrl_.message_initiate_smp_q(userstate._pointer,this._pointer,this._opsdata,context._pointer,question,secret,secret.length);
        }else{
            otrl_.message_initiate_smp(userstate._pointer,this._pointer,this._opsdata,context._pointer,secret,secret.length);
        }
    }
};
OtrlMessageAppOps.prototype.respondSMP = function(userstate,context,secret){
    if(!(
        typeof userstate=='object' &&
        typeof context=='object' &&
        typeof secret=='string' 
    )){
        throw("invalid arguments to respondSMP()");
    }
    otrl_.message_respond_smp(userstate._pointer,this._pointer,this._opsdata,context._pointer,secret,secret.length);
};

function ops_event($opsdata, ev_obj, ev_name){
  var $index = getValue($opsdata,"i32");
  if(ev_name) ev_obj.EVENT = ev_name;

  if(ev_name=='is_logged_in' || ev_name=='policy' || ev_name=='max_message_size'){
    return MAO[$index].instance._event_handler(ev_obj);
  }else{
    //setTimeout(function(){
        //console.log("ops_event:",ev_name);
        //MAO[$index].handler(ev_obj);//async firing of the event!
        ev_obj._ = MAO[$index].instance;
        OPS_QUEUE.push(ev_obj);
    //},5);
  }
}

//TODO Add a SHA1 checksum of the file system.
//gzip and encrypt the file system?
// *** Closure Compiler will change names of objects inside the FS ***//
function VirtualFileSystem ( file ) {
 var defaultFile = file || "./virtual.vfs";
 return ({
    "export":function(){
        //note - devices are not properly exported because functions cannot be serialised.
        return JSON.stringify({
            "root": libModule.FS.root,
            "nextInode": libModule.FS.nextInode
        });
    },
    "import": function( data ){
        var importedFS = JSON.parse(data);
        //link devices to alreardy initialised file system. 
        //we should import a vfs early on and preferably once on initial launch of the application - (circular refrences below
        //could keep the FS data from being garbage collected?
        importedFS.root.contents['dev'].contents['random'].input = libModule.FS.root.contents['dev'].contents['random'].input;
        importedFS.root.contents['dev'].contents['random'].output = libModule.FS.root.contents['dev'].contents['random'].output;
        importedFS.root.contents['dev'].contents['urandom'].input = libModule.FS.root.contents['dev'].contents['urandom'].input;
        importedFS.root.contents['dev'].contents['urandom'].output = libModule.FS.root.contents['dev'].contents['urandom'].output;
        importedFS.root.contents['dev'].contents['stdout'].output = libModule.FS.root.contents['dev'].contents['stdout'].output;
        importedFS.root.contents['dev'].contents['stdin'].intput =  libModule.FS.root.contents['dev'].contents['stdin'].input;
        importedFS.root.contents['dev'].contents['stderr'].output = libModule.FS.root.contents['dev'].contents['stderr'].output;
        importedFS.root.contents['dev'].contents['tty'].output = libModule.FS.root.contents['dev'].contents['tty'].output;
        importedFS.root.contents['dev'].contents['tty'].input = libModule.FS.root.contents['dev'].contents['tty'].input;

        //var open_streams = libModule.FS.streams.length;
        //if(open_streams > 3) console.log("= VFS Import Warning:",open_streams - 3," files open.");//how to handle this case?
        
        //link default streams to imported devices -- this might not really be necessary..
        //stdin stream
          libModule.FS.streams[1].object = importedFS.root.contents['dev'].contents['stdin'];
        //stdou stream
          libModule.FS.streams[2].object = importedFS.root.contents['dev'].contents['stdout'];
        //stderr stream
          libModule.FS.streams[3].object = importedFS.root.contents['dev'].contents['stderr'];

        libModule.FS.root = importedFS.root;
        libModule.FS.nextInode = importedFS.nextInode;

    },
    "load": function( filename ){
        if(!fs) return;
        var realFile = filename || defaultFile;
        try{
            console.error("loading virtual file system:",realFile);
            var data = fs.readFileSync(realFile);
            this.import(data);
        }catch(e){
            console.error( e );
        }
        return this;
    },
    "save": function (filename){
        if(!fs) return;
        var realFile = filename || defaultFile;
        console.error("saving virtual filesystem to:",realFile);
        fs.writeFileSync(realFile,this.export());
        return this;
    },
    "importFile": function (source,destination){
        if(!fs) return;
        //cp a file from real file system to virtual file system
        
    },
    "exportFile": function (source,destination){
        if(!fs) return;
        //cp a file from virtual file system to real file system
        //TODO preserve same file permissions (mode)
        var data = new Buffer(libModule.FS.root.contents[source].contents);
        var fd = fs.openSync(destination,"w");
        console.log("wrote",fs.writeSync(fd,data,0,data.length,0),"bytes to",destination);
        fs.closeSync(fd);
    }
 });
}

}).call(this);

;(function () {

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

  var root = this

  var Module, ASYNC, fs, path, BigInt;

  if (typeof exports !== 'undefined') {
    Module = require("./libotr3.js");
    ASYNC = require("./async");
    fs = require("fs");
    path = require("path");
    BigInt = require("./bigint.js");
    module.exports = otrBindings;
    var fs_existsSync = fs.existsSync || path.existsSync;
    if(!path.sep){
        path.sep = (process.platform.indexOf("win")==0) ? "\\":"/";
    }
  } else {
    Module = root.libotr3Module;
    ASYNC = root.async;
    fs = undefined;//local storage?
    BigInt = root.BigInt;
    root.otrBindings = otrBindings;
  }

//exported C functions
var otrl_ = Module.libotrl; //cwrap()'ed functions from libotr
var gcry_ = Module.libgcrypt; //cwrap()'ed functions from libgcrypt
var jsapi_= Module.jsapi; //cwrap()'ed helper functions in C

var helper_ = {};
helper_.ptr_to_ArrayBuffer=Module["ptr_to_ArrayBuffer"];
helper_.ab2str = Module["ab2str"];
helper_.str2ab = Module["str2ab"];
helper_.unsigned_int32 = Module["unsigned_int32"];
helper_.bigint2mpi = Module["bigint2mpi"];
helper_.mpi2bigint = Module["mpi2bigint"];

var _malloc = Module["_malloc"];
var _free = Module["_free"];
var getValue = Module.getValue;
var setValue = Module.setValue;
var Pointer_stringify = Module.Pointer_stringify;

//exposing some objects to code living in libotr3.js 
Module["ops_event"] = ops_event;
Module["ConnContext"] = OtrlConnContext;

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
    },

    GcryptError: GcryptError
    
};

//OtrlPrivKey
function OtrlPrivKey(ptr){
    this._pointer = ptr;
};
OtrlPrivKey.prototype.next = function(){
    var ptr = jsapi_.privkey_get_next(this._pointer);
    if(ptr) return new OtrlPrivKey(ptr);
    return null;
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
        err = jsapi_.privkey_get_dsa_token(self._pointer,token,buffer,1024,nbytes_ptr);
        if(err){
            _free(buffer);
            _free(nbytes_ptr);
            throw( new GcryptError(err) );
            console.error("error exporting key:", gcry_.strerror(err) );
        }else{
            nbytes = getValue(nbytes_ptr);
            if(nbytes){
                dsakey[token] = Pointer_stringify( buffer );
            }
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
OtrlPrivKey.prototype.exportPublic = function( format ){
    var key = this.export(format);
    if(key){
        delete key.x;
        return key;
    }
}
OtrlPrivKey.prototype.toString = function(){
    return this.exportPublic("HEX");
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
    return null;
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
            "fingerprint":self.fingerprint(accountname,protocol),
            "privkey": p
        });
        p = p.next();
    }
    return accounts;
};
OtrlUserState.prototype.generateKey = function(filename,accountname,protocol,callback){    
    var self = this;
    if(typeof filename == 'string' && typeof accountname=='string' && typeof protocol=='string' && typeof callback == 'function'){
      console.log("generating key for:",accountname," protocol:",protocol);
      var err = otrl_.privkey_generate(this._pointer,filename,accountname,protocol);
      try{                
        callback.apply(self, [err ? new GcryptError(err) : null, err? undefined:this.findKey(accountname,protocol)] );
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
    if(typeof filename=='string'){
        var err = otrl_.privkey_read(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to readKeysSync()");
    }
};
OtrlUserState.prototype.writeKeysSync = function(filename){
    if(typeof filename=='string'){
        var err = jsapi_.userstate_write_to_file(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to writeKeysSync()");
    }
};
OtrlUserState.prototype.readFingerprintsSync = function(filename){
    if(typeof filename == 'string'){
        var err = otrl_.privkey_read_fingerprints(this._pointer,filename,0,0);
        //return (err?gcry_.strerror(err):undefined);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to readFingerprintsSync()");
    }
};
OtrlUserState.prototype.writeFingerprintsSync = function (filename){
    if(typeof filename == 'string'){    
        var err = otrl_.privkey_write_fingerprints(this._pointer,filename);
        //return (err?gcry_.strerror(err):undefined);
        if(err) throw( new GcryptError(err) );
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
    return null;
};
OtrlUserState.prototype.forgetAllKeys = function(){
    otrl_.privkey_forget_all(this._pointer);
};
OtrlUserState.prototype.deleteKeyOnFile = function(filename,accountname,protocol){   
    jsapi_.privkey_delete(this._pointer,filename,accountname,protocol);        
};
OtrlUserState.prototype.importKey = function (accountname,protocol,dsa,base){
    var err = 0;
    var mpi = {
        p: gcry_.mpi_new ( 1024 ),
        q: gcry_.mpi_new ( 1024 ),
        g: gcry_.mpi_new ( 1024 ),
        y: gcry_.mpi_new ( 1024 ),
        x: gcry_.mpi_new ( 1024 )
    };
    var doImport=true;
    ['p','q','g','y','x'].forEach(function(t){
        var bi;
        switch( typeof dsa[t] ){
            case 'string':
                bi = BigInt.str2bigInt(dsa[t],base || 16);
                break;
            case 'object':
                bi = dsa[t];
                break;
            default:
                doImport = false;
                bi = null;
        }
        if(bi!=null) {
            //console.log("converting BI to mpi:",bi);
            helper_.bigint2mpi(mpi[t],bi);
        } 
    });
    if( doImport ) {
      //console.log("importing mpi:",mpi);
      err = jsapi_.userstate_import_privkey(this._pointer,accountname,protocol, mpi.p, mpi.q, mpi.g, mpi.y, mpi.x );
      //console.log( "import result:", gcry_.strerror(err));      
    }

    ['p','q','g','y','x'].forEach(function(t){
        gcry_.mpi_release(mpi[t]);
    });
    if(doImport && err) throw new GcryptError(err);    
    if(!doImport) throw new Error("DSA Key import failed. Unsupported Format.");
}


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
    try{
        instance._event_handler(O);
    }catch(e){        
    }
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
   if(err) throw new GcryptError(err)
   //return gcry_.strerror(err);
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
  var event_handled = false;
  var ret_value;

  //handle following ops synchronously
  ['is_logged_in','policy','max_message_size','create_privkey','new_fingerprint','write_fingerprints'].forEach(function(E){
      if(ev_name == E){
        event_handled = true;
        ret_value = MAO[$index].instance._event_handler(ev_obj);
      }
  });

  if(event_handled){
    return ret_value;
  }else{
      //fire events asynchronously
      ev_obj._ = MAO[$index].instance;
      OPS_QUEUE.push(ev_obj);
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
            "root": Module.FS.root,
            "nextInode": Module.FS.nextInode
        });
    },
    "import": function( data ){
        var importedFS = JSON.parse(data);
        //link devices to alreardy initialised file system. 
        //we should import a vfs early on and preferably once on initial launch of the application - (circular refrences below
        //could keep the FS data from being garbage collected?
        importedFS.root.contents['dev'].contents['random'].input = Module.FS.root.contents['dev'].contents['random'].input;
        importedFS.root.contents['dev'].contents['random'].output = Module.FS.root.contents['dev'].contents['random'].output;
        importedFS.root.contents['dev'].contents['urandom'].input = Module.FS.root.contents['dev'].contents['urandom'].input;
        importedFS.root.contents['dev'].contents['urandom'].output = Module.FS.root.contents['dev'].contents['urandom'].output;
        importedFS.root.contents['dev'].contents['stdout'].output = Module.FS.root.contents['dev'].contents['stdout'].output;
        importedFS.root.contents['dev'].contents['stdin'].intput =  Module.FS.root.contents['dev'].contents['stdin'].input;
        importedFS.root.contents['dev'].contents['stderr'].output = Module.FS.root.contents['dev'].contents['stderr'].output;
        importedFS.root.contents['dev'].contents['tty'].output = Module.FS.root.contents['dev'].contents['tty'].output;
        importedFS.root.contents['dev'].contents['tty'].input = Module.FS.root.contents['dev'].contents['tty'].input;

        //var open_streams = Module.FS.streams.length;
        //if(open_streams > 3) console.log("= VFS Import Warning:",open_streams - 3," files open.");//how to handle this case?
        
        //link default streams to imported devices -- this might not really be necessary..
        //stdin stream
          Module.FS.streams[1].object = importedFS.root.contents['dev'].contents['stdin'];
        //stdou stream
          Module.FS.streams[2].object = importedFS.root.contents['dev'].contents['stdout'];
        //stderr stream
          Module.FS.streams[3].object = importedFS.root.contents['dev'].contents['stderr'];

        Module.FS.root = importedFS.root;
        Module.FS.nextInode = importedFS.nextInode;

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
    "importFile": function (source,destination,decrypt){
        //cp a file from real file system to virtual file system - full paths must be specified.
        if(!fs) return;
        destination = destination || source.substr(0);
        destination = path_vfs(destination);
        source = path_real(source);
        var target_folder, data, virtual_file;
        var filename = destination.split('/').reverse()[0];
        if( filename ){
            target_folder = Module.FS_findObject(path_vfs(path.dirname(destination)));
            if(!target_folder){
                target_folder = Module.FS_createPath("/",path_vfs(path.dirname(destination)),true,true);
            }
            if(target_folder){
              if( fs_existsSync(source) ){
                data = fs.readFileSync(source);
                data = decrypt ? decrypt(data) : data;
                virtual_file = Module.FS_createDataFile(target_folder,filename,data,true,true);
              }else console.error("importing to vfs, file not found.",source);
            }
        }
    },
    "exportFile": function (source,destination,encrypt){
        //cp a file from virtual file system to real file system
        if(!fs) return;
        var data,fd;
        destination = destination || source.substr(0);//export to same path
        destination = path_real(destination);
        source = path_vfs(source);
        //TODO preserve same file permissions (mode) - make sure files only readable by user
        var data = Module.FS_readDataFile(source);
        if(data){
            data = encrypt ? encrypt(data) : data;
            if(!fs_existsSync(path_real(path.dirname(destination)))) fs.mkdirSync(path_real(path.dirname(destination)));
            fd = fs.openSync(destination,"w");
            fs.writeSync(fd,data,0,data.length,0);
            fs.closeSync(fd);        
        }else console.error("virtual file not found",source);
    }
 });
}

function path_real(p){
  return p.replace(new RegExp('/', 'g'), path.sep);
}
function path_vfs(p){
  return p.replace(new RegExp(/\\/g), '/');
}

function GcryptError( num ) {
    this.num = num || 0;
    this.message = gcry_.strerror(num || 0);
}
GcryptError.prototype = new Error();
GcryptError.prototype.constructor = GcryptError;


}).call();

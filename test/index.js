if(typeof exports !== 'undefined'){
    var async = require("../lib/async");
    var OTR = require("../lib/otr-module");
}

var otr = OTR;

console.log("== loaded libotr version:",otr.version());

var debug = function(){};

var USE_VFS = false;
var TEST_PASSED=false;
var verbose =true;
var FORCE_SMP = false;
var SUCCESSFULL_SMP = false;

if(typeof process !== "undefined" ){
 process.argv.forEach(function(arg){
    if(arg=="--verbose") verbose = true;
    if(arg=="--vfs") USE_VFS=true;
    if(arg=="--force-smp") FORCE_SMP=true;
 });
}

if(verbose){
    otr.debugOn();
    debug = function(){console.log([].join.call(arguments," "));};
}

if(USE_VFS){
    var VFS = otr.VFS(__dirname+"/default.vfs").load();
}

var keys_dir = ".";

var alice = new otr.User({name:'alice',keys:keys_dir+'/alice.keys',fingerprints:keys_dir+'/alice.fp'});
//if we dont have a key make one
if( !alice.findKey("alice@telechat.org","telechat") ){
alice.generateKey("alice@telechat.org","telechat",function(err){
    if(err){
        console.error("error generating key:",err.message);
    }else{
        console.log("Key Generation Complete.");
    }
});
}
var BOB = alice.ConnContext("alice@telechat.org","telechat","BOB");
var otrchan_a = new otr.Session(alice, BOB,{policy:otr.POLICY("ALWAYS"),secret:'s3cr37'});

var bob = new otr.User({name:'bob',keys:keys_dir+'/bob.keys',fingerprints:keys_dir+'/bob.fp'});
//if we dont have a key make one
if( !bob.findKey("bob@telechat.org","telechat") ){
bob.generateKey("bob@telechat.org","telechat",function(err){
    if(err){
        console.error("error generating key:",err.message);
    }else{
        console.log("Key Generation Complete.");
    }
});
}
var ALICE = bob.ConnContext("bob@telechat.org","telechat","ALICE");
var otrchan_b = new otr.Session(bob, ALICE,{policy:otr.POLICY("ALWAYS"),secret:'s3cr37'});

var NET_QUEUE_A = async.queue(handle_messages,1);
var NET_QUEUE_B = async.queue(handle_messages,1);

function handle_messages(O,callback){
    O.channel.recv(O.msg);
    callback();
    if(verbose) dumpConnContext(O.channel,O.channel.user.name);
}

console.log(otrchan_a);
console.log(otrchan_b);

    
//simulate a network connection between two parties
otrchan_a.on("inject_message",function(msg){
        NET_QUEUE_A.push({channel:otrchan_b,msg:msg});
});
otrchan_b.on("inject_message",function(msg){
        NET_QUEUE_B.push({channel:otrchan_a,msg:msg});
});

//output incoming messages to console
otrchan_a.on("message",function(msg){
    if(this.isEncrypted()) {
        console.log('encrypted: Bob->Alice: ', msg);
    }else{
        //policy is set to ALWAYS so we should not get any unencrypted messages!
        console.log('not-encrypted!!!: Bob->Alice: ',msg);
    }
});

//output incoming messages to console
otrchan_b.on("message",function(msg){    
    if(this.isEncrypted()) {
        console.log('encrypted: Alice->Bob: ', msg);
    }else{
        //policy is set to ALWAYS so we should not get any unencrypted messages!
        console.log('not-encrypted!!!: Alice->Bob: ',msg);
    }
});


//will get fired because we are manually closing otrchan_b
otrchan_b.on("shutdown",function(){
    console.log("Bob's channel shutting down.");
    exit_test("");

});

//because otrchan_b was closed otrchan_a get a remote_disconnect event.
otrchan_a.on("remote_disconnected",function(){
    console.log("Bob disconnected");
    exit_test("");
});


otrchan_a.on("gone_secure",function(){
    if(!this.isAuthenticated() || FORCE_SMP){
            console.log("Alice initiating SMP authentication to verify keys...");
            otrchan_a.start_smp();
    }
});

otrchan_b.on("smp_request",function(){
        console.log("Bob responding to SMP request.");
        otrchan_b.respond_smp('s3cr37');
});
otrchan_a.on("smp_complete",function(){
    SUCCESSFULL_SMP = true;
});
otrchan_b.on("smp_complete",function(){
    otrchan_a.send("Hello Bob! - 2");
});

otrchan_a.send("Hello Bob! - 1");

var loop = setInterval(function(){
    console.log("_");
    if(FORCE_SMP && !SUCCESSFULL_SMP){
        return;
    }
    if(otrchan_a.isEncrypted() && otrchan_a.isAuthenticated() && otrchan_b.isEncrypted() && otrchan_b.isAuthenticated() ){
        console.log("Finger print verification successful");
        dumpConnContext(otrchan_a,"Alice's ConnContext:");
        dumpConnContext(otrchan_b,"Bob's ConnContext:");   
        TEST_PASSED=true;        
        if(loop) clearInterval(loop);        
        otrchan_b.close();
    }
},500);

function exit_test(msg){
    console.log(msg);
    if(TEST_PASSED){ console.log("== TEST PASSED ==\n"); } else { console.log("== TEST FAILED ==\n"); }
    if(VFS) VFS.save();
    process.exit();
}

function dumpConnContext(chan,msg){
    console.log(msg,"\n",chan.context.obj());
}


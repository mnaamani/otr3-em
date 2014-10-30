var otr = require("../lib/otr-module");

var print = console.error;

print("libotr version:",otr.version());

var VFS_PATH = __dirname+"/test.vfs";

var settings_a = {
    'key_file':'alice.keys',
    'fp_file': 'alice.fp',
}
var settings_b = {
    'key_file':'bob.keys',
    'fp_file': 'bob.fp',
}

var VFS = otr.VFS();

test();

VFS.save( VFS_PATH );
VFS.exportFile(settings_a.key_file, __dirname+"/"+settings_a.key_file);
VFS.exportFile(settings_b.key_file, __dirname+"/"+settings_b.key_file);

function test(){
    var ALICE = new otr.User({
        name: 'Alice',
        keys: settings_a.key_file,
        fingerprints: settings_a.fp_file
    });

    var BOB = new otr.User({
        name: 'Bob',
        keys: settings_b.key_file,
        fingerprints: settings_b.fp_file
    });

    ALICE.generateKey("alice@export.test","test",function(err,key){
        if(err) exit("key generation failed");
    });
    print(ALICE.accounts());

    BOB.generateKey("bob@export.test","test",function(err,key){
        if(err) exit("key generation failed");
    });
    print(BOB.accounts());
}

function exit(msg){
    print(msg);
    process.exit();
}

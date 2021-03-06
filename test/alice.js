var otr = require("../lib/otr-module");

var print = console.error;

print("libotr version:",otr.version());

var settings = {
    'key_file':'alice.keys',
    'fp_file': 'alice.fp',
    'accountname':'alice@telechat.org',
    'protocol':'telechat',
    'vfs_path':__dirname+'/alice.vfs'
}

var VFS = otr.VFS().load( settings.vfs_path );

test();

VFS.save( settings.vfs_path );

function test(){
    var user = new otr.User({
        name: 'Alice',
        keys: settings.key_file,
        fingerprints: settings.fp_file
    });

    var key = user.findKey(settings.accountname,settings.protocol); 
    if(key){
       print( key.export() );
    } else {
        user.generateKey(settings.accountname,settings.protocol,function(err,key){
          if(err) {
            print("error generating key:",err);
          }else{
            print("generated key:",key.export());
          }
        });
    }
    
    print(user.state.accounts());
    //user.deleteKey(settings.accountname,settings.protocol);
}

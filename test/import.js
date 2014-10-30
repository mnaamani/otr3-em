var otr = require("../lib/otr-module");

var print = console.error;

print("libotr version:",otr.version());

var settings_a = {
    'key_file':'alice.keys',
    'fp_file': 'alice.fp',
}
var settings_b = {
    'key_file':'bob.keys',
    'fp_file': 'bob.fp',
}

var VFS = otr.VFS();

VFS.importFile(__dirname+"/"+settings_a.key_file, settings_a.key_file);
VFS.importFile(__dirname+"/"+settings_b.key_file, settings_b.key_file);

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

print(ALICE.accounts());
print(BOB.accounts());

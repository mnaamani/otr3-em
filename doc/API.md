OTR3-em - Off-the-Record Messaging [emscripten]
=====================

## Getting started

Require the otr3-em module (underlying gcrypt and otr libraries will be
initialised. An OTR API constructor is returned.

    var OTR = require("otr3-em");

create an instance of the OTR API:

    var otr = new OTR();
    
## otr.version()
Returns version information of the underlying libotr:

     console.log("Using version:", otr.version() );

## otr.User( config )
The User object is used to manage a user's accounts (public keys) and known fingerprints.

    var OTR = require("otr3-em");
    var otr = new OTR();
    
    var user = new OTR.User({ 
        keys:'/alice.keys',      //path to OTR keys file (required)
        fingerprints:'alice.fp' //path to fingerprints file (required)
    });

All data is loaded in memory (UserState) and persisted on the virtual file system VFS().

If specified files exist the keys and fingerprints will be loaded automatically.
A warning will be logged to the console otherwise.

### user.accounts()

We can check what accounts have been load..

    user.accounts().forEach(function(account){
        console.log(account.fingerprint);
    });

	[ { accountname: 'alice@jabber.org',
	    protocol: 'xmpp',
	    fingerprint: '65D366AF CF9B065F 41708CB0 1DC26F61 D3DF5935',
	    privkey: [Object] } ]

### user.generateKey(accountname,protocol,function callback(err,key) )

To generate an OTR key for a given accountname and protocol:
(If a key already exists it will be overwritten)

    user.generateKey("alice@jabber.org", "xmpp", function(err, key){
        if(err){
        	console.log("something went wrong!",err.message);
        }else{
        	console.log("Generated Key Successfully:",key.exportPublic() );
        }
    });


### user.fingerprint(accountname,protocol)

To retreive the fingerprint of a key:

	user.fingerprint("alice@jabber.org","xmpp");

returns

	'65D366AF CF9B065F 41708CB0 1DC26F61 D3DF5935'

### user.findKey(accountname,protocol)
Retrieve an OtrlPrivKey() instance if it exists. (null otherwise)

### user.deleteKey(accountname,protocol)
Deleted a key from memory and file if it exists.

### user.ConnContext(accountname, protocol, buddy_name)
Create a ConnContext(). accountname and protocol will select the key to use in this context, and buddy_name 
is our chosen name for the remote party which is stored in the fingerprints file.

### user.writeFingerprints()
Writes fingerprints out to file.

### user.writeKeys()
Writes keys out to file.

### user.prototype.exportKeyHex(accountname,protocol)
Exports the DSA key for the account/protocol. (Can be imported to another User using user.importKey())

### user.prototype.exportKeyBigInt(accountname,protocol)
Exports the DSA key for the account/protocol. (Can be imported to another User using user.importKey())

### user.prototype.importKey(accountname,protocol,dsa)
Will import a DSA key (exported using user.exportKeyHex or user.exportBigInt)

## OtrlPrivKey
This is the 'key' object returned in user.accounts(), user.generateKey() and user.findKey().

**privkey.accountname()** - Accountname the key is associated with.
**privkey.protocol()** - Protocol the key is associated with.
**privkey.export(format)** - Exports the private DSA key. format can be "HEX" or "BIGINT"
**privkey.exportPublic(format)** - Exports only the public components of the DSA key. format can be "HEX" or "BINGINT"

## otr.ConnContext()
A ConnContext with buddy 'BOB' is created from a User() object. The last argument is
our selected name for buddy Bob.

    var context = alice.ConnContext("alice@jabber.org","xmpp","BOB");

The following methods of the ConnContext() expose it's internal state:

* protocol(): string: eg. "xmpp"
* username(): string: name we have given to the buddy, eg. "BOB"
* accountname(): string: our account name , eg. "alice@jabber.org"
* fingerprint(): string: fingerprint of buddy in an active Session()
* protocol_version(): number: otr protocol version in use, eg. 2
* msgstate(): number: 0 = plaintext, 1 = encrypted
* smstate(): number: current state of the SMP (Socialist Millionaire's Protocol)
* trust(): string: 'smp' if buddy/fingerprint has been verified by SMP


## otr.Session()

To setup an OTR conversation with a buddy, create a Session(). As arguments
it takes a User, ConnContext, and a set of parameters for the session. Session instances
are event emitters.

**Setting up a Session()**

    var session = new otr.Session(alice, BOB, {
        policy: otr.POLICY("ALWAYS"), //optional policy - default = otr.POLICY("DEFAULT")
        MTU: 5000,          //optional - max fragment size in bytes - default=0,no-fragmentation
        secret: "SECRET",   //secret for SMP authentication.                           
        secrets: {'question-1':'secret-1',
                  'question-2':'secret-2'} //questions,answers pairs for SMP Authentication.
    });

**Starting and Ending an OTR conversation**

### session.connect()
connect() will initiate the otr protocol
This can be used if we wish to initiate the protocol without sending an actual message.

### session.close()
close() will end the otr session.

**Exchanging Messages**

### session.send(message)
send() will fragment and send message.toString()

### session.recv(message)
call recv() when receiving message

**Authenticating with SMP (Socialist Millionaire's Protocol)**

### session.start_smp([secret])
starts SMP authentication. If otional [secret] is not passed it is taken from the parameters.

### session.start_smp_question(question,[secret])
start SMP authentication with a question and optional [secret]. If secret is not passed 
it is taken from the parameters.

### session.respond_smp([secret])
responds to SMP authentication request with optional [secret]. If secret is not passed 
it is taken from the parameters.

**At anytime we can check encryption and trust level of the session**

### session.isEncrypted()
returns true only if current session is encrypted.

### session.isAuthenticated()
return true only if the fingerprint of the buddy has been authenticated/verified by SMP.

**Handling Session events**

* message(msg) - received decrypted 'msg' message.

* inject_message(msg_fragment) - encrypted msg_fragment to be sent to buddy.

* gone_secure() - message exchange is now encrypted.
* gone_insecure() - message exchange is now in plain text.
* still_secure() - encryption re-negotiated. message exchange is encrypted.

* create_privkey() - a private key for account/protocol specified was not found and needs to be created.
* new_fingerprint(fingerprint) - first time we are seeing buddy's fingerprint. This is a que to begin authentication.

* smp_request(question) - buddy has started SMP authentication. (possibly with a question)
* smp_complete() - SMP authentication completed successfully.
* smp_failed() - SMP failed (usually buddy doesn't know the secret)
* smp_aborted() - SMP (something went wrong at the protocol level)

* remote_disconnected() - session closed() [remotely]
* update_context_list() - fired when underlying ConnContext changes (inteded mostly for UI updates)
* shutdown() - session was closed() [locally]

* display_otr_message(msg) //human readable notification message
* notify(title,primary,secondary) //notification (fired after display_otr_message for same notification message)
* log_message(msg) //debug log messages from libotr

## otr.POLICY(name)

The policy is used as a parameter when setting up a Session().

    var OTR = require("otr3-em");
    var otr = new OTR();
    var policy = otr.POLICY("DEFAULT");

    //available policies
    'NEVER'
    'ALLOW_V1'
    'ALLOW_V2'
    'REQUIRE_ENCRYPTION'
    'SEND_WHITESPACE_TAG'
    'WHITESPACE_START_AKE'
    'ERROR_START_AKE'
    'VERSION_MASK'
    'OPPORTUNISTIC'
    'MANUAL'
    'ALWAYS'
    'DEFAULT'
    
## VFS() - The Virtual File System
The Virtual File System (vfs) can be easily serialed to JSON for simple import and export to persist key and fingerprint files.

     var VFS = otr.VFS();

### VFS.save( vfs_file_location )
Takes a snapshop of the vfs and stores it on the real filesystem in at location 'filename'.
 
### VFS.load( vfs_file_location )
Loads a vfs stored in localfile 'filename'

### VFS.exportFile( source, destination )
Copies a file from the vfs to the real file system.


  


OTR3-em - Off-the-Record Messaging [emscripten]
=====================

## Getting started

Require the otr3-em module (underlying gcrypt and otr libraries will be
initialised. An OTR API constructor is returned.

    var OTR = require("otr3-em");

create and instance of the OTR API:

    var otr = new OTR();
    
## version()
Returns version information of the underlying libotr:

     console.log("Using version:", otr.version() );

## User()
The User object is a wrapper for UserState() (see below). It holds a user's configuration [name, keys, fingerprints] 

    var OTR = require("otr3-em");
    var otr = new OTR();    
    
    var alice = new OTR.User({
        name:'Alice',			      //an identifier for the User object
        keys:'alice.keys',      //path to OTR keys file (required)
        fingerprints:'alice/alice.fp' //path to fingerprints file (required)
    });

Note: A Virtual file system (VFS) is used not the real file system. (see VFS() below)

If files exists the keys and fingerprints will be loaded into the userstate automatically.
A warning will be displayed otherwise.

If you need to generate a new OTR key for a given accountname and protocol: 

    alice.generateKey("alice@jabber.org", "xmpp", function(err){
        if(err){
        	console.log("something went wrong!",err);
        }        
    });

To directly access the wrapped UserState object:

    var userstate = alice.state;
    userstate.accounts().forEach(function(account){
        console.log(account.fingerprint);
    });

## UserState()
The UserState holds keys and fingerprints in memory. It exposes methods to read/write these keys
and fingerprints to the file system, as well as methods to generate them.
	
	var OTR = require("otr3-em");
	var otr = new OTR();
	var userstate = new otr.UserState();


### userstate.generateKey(path_to_keys_file, accountname, protocol, [callback])
generateKey() will 'synchronously' generate a new OTR key for provided accountname/protocol (overwriting existing key).
The newly generated key will be stored stored in the userstate. When the process is complete the 
userstate/keys are written out to file.

	userstate.generateKey('/home/alice/myotr.keys', 'alice@jabber.org','xmpp',function(err){
		//call back with err if any
		if(err){			
			console.log(err);
		}
	});

### userstate.fingerprint(accountname,protocol)
Returns the fingerprint of the key associated with accountname and protocol of the form:

	'65D366AF CF9B065F 41708CB0 1DC26F61 D3DF5935'

### userstate.accounts()
Returns an array of account objects:

	[ { accountname: 'alice@jabber.org',
	    protocol: 'xmpp',
	    fingerprint: '65D366AF CF9B065F 41708CB0 1DC26F61 D3DF5935' } ]

### userstate.readKeysSync(path_to_keys_file)
Synchronously reads the stored keys into the userstate.

### userstate.readFingerprintsSync(path_to_fingerprints_file)
Synchronously reads the stored fingerprints into the userstate.

### userstate.writeFingerprintsSync(path_to_fingerprints_file)
Synchronously writes out the fingerprints in userstate to file.

## ConnContext()
A ConnContext with buddy 'BOB' for a given UserState (userstate) can be created as follows:

    var ctx = new otr.ConnContext(userstate, "alice@jabber.org","xmpp","BOB" );

where the second and third arguments specifiy which OTR key to use. The last argument is
our selected name for the buddy Bob.

..or from a User object (alice):

    var ctx = alice.ConnContext("alice@jabber.org","xmpp","BOB");

The following methods of the ConnContext expose the internal properties:

* protocol(): string: eg. "xmpp"
* username(): string: name we have given to the buddy, eg. "BOB"
* accountname(): string: our account name , eg. "alice@jabber.org"
* fingerprint(): string: fingerprint of buddy in an active Session()
* protocol_version(): number: otr protocol version in use, eg. 2
* msgstate(): number: 0 = plaintext, 1 = encrypted
* smstate(): number: current state of the SMP (Socialist Millionaire's Protocol)
* trust(): string: 'smp' if buddy/fingerprint has been verified by SMP


## Session()  (formally OTRChannel)
To setup an OTR conversation with a buddy, create a Session(). As arguments
it takes a User, ConnContext, and a set of parameters for the session. Sessions instances
are event emitters.

**Setting up a Session()**

    var session = new otr.Session(alice, BOB, {
        policy: otr.POLICY("ALWAYS"), //optional policy - default = POLICY("DEFAULT")
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

## POLICY(name)

The policy is used as a parameter in Session().

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

  export:
  import:
  load:
  save:
  importFile:
  exportFile:
  


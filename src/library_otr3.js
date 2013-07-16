mergeInto(LibraryManager.library, {
  $Helper__postset: 'Module["ptr_to_HexString"]=Helper.ptr_to_HexString;'+
                    'Module["ptr_to_Buffer"]=Helper.ptr_to_Buffer;'+
                    'Module["ptr_to_ArrayBuffer"]=Helper.ptr_to_ArrayBuffer;'+
                    'Module["unsigned_char"]=Helper.unsigned_char;'+
                    'Module["unsigned_int32"]=Helper.unsigned_int32;'+
                    'Module["ab2str"]=Helper.ab2str;'+
                    'Module["str2ab"]=Helper.str2ab;',
  $Helper:{
    ptr_to_HexString: function(ptr,len){
        var hexDigit = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
        function hexString(val){
            return hexDigit[(val & 0xF0) >> 4] + hexDigit[val & 0x0F];
        }
        var hex = "";
        for(var i=0; i<len; i++){
            hex = hex + hexString( Helper.unsigned_char( getValue( ptr + i,"i8")));
        }
        return hex;
    },
    ptr_to_Buffer: function(ptr,len){
        var buf = new Buffer(len);
        for(var i=0; i<len; i++){
            buf.writeInt8(getValue(ptr+i,"i8"),i);
        }
        return buf;
    },
    ptr_to_ArrayBuffer: function(ptr,len){
        var buf = new ArrayBuffer(len);
        var u8 = new Uint8Array(buf);
        for(var i=0; i<len; i++){
            u8[i]= Helper.unsigned_char( getValue( ptr + i,"i8"));
        }
        return buf;
    },
    unsigned_char: function( c ){
        c = c & 0xFF;
        return ( c < 0 ? (0xFF+1)+c : c );
    },
    unsigned_int32: function( i ){
        //i must be in the range of a signed 32-bit integer!
        i = i & 0xFFFFFFFF;//truncate so we dont return values larger than an unsigned 32-bit int.
        return ( i < 0 ? (0xFFFFFFFF+1)+i : i );
    },
    // http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
    ab2str: function(buf) {
      return String.fromCharCode.apply(null, new Uint16Array(buf));
    },
    str2ab: function(str) {
      var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
      var bufView = new Uint16Array(buf);
      for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
      }
      return buf;
    }
  },
  msgops_callback_policy: function(opdata,context){
    return Module["ops_event"](opdata,{},"policy");
  },
    
  msgops_callback_create_privkey: function(opdata,accountname,protocol){
        Module["ops_event"](opdata,{
          "accountname":Pointer_stringify(accountname),
            "protocol":Pointer_stringify(protocol)
          },"create_privkey");
  },

  msgops_callback_is_logged_in: function(opdata,accountname,protocol,recipient){
        return Module["ops_event"](opdata,{},"is_logged_in");
  },

  msgops_callback_inject_message: function(opdata,accountname,protocol,recipient,message){
        Module["ops_event"](opdata,{
            "message":Pointer_stringify(message)
        },"inject_message");
  },     

  msgops_callback_notify: function(opdata,level,accountname,protocol,
        username,title,primary,secondary){
    Module["ops_event"](opdata,{
        "title":Pointer_stringify(title),
        "primary":Pointer_stringify(primary),
        "secondary":Pointer_stringify(secondary),
        "level":level
    },"notify");
 },

 msgops_callback_display_otr_message: function(opdata,accountname,protocol,username,msg){
    Module["ops_event"](opdata,{
        "message":Module["Pointer_stringify"](msg)
    },"display_otr_message");
    return 1;//fire notify as well
  },

  msgops_callback_update_context_list: function(opdata){
        Module["ops_event"](opdata,{},"update_context_list");
  },

  msgops_callback_new_fingerprint__deps:['otrl_privkey_hash_to_human','malloc','free'],
  msgops_callback_new_fingerprint: function(opdata,userstate,accountname,protocol,username,fingerprint){
        var human = _malloc(45);
        _otrl_privkey_hash_to_human(human, fingerprint);
        Module["ops_event"](opdata,{
            "fingerprint":Pointer_stringify(human)
        },"new_fingerprint");
        _free(human);
  },

  msgops_callback_write_fingerprints: function(opdata){
        Module["ops_event"](opdata,{},"write_fingerprints");
  },

  msgops_callback_gone_secure: function(opdata,context){
        Module["ops_event"](opdata,{},"gone_secure");
  },
    
  msgops_callback_gone_insecure: function(opdata,context){
        Module["ops_event"](opdata,{},"gone_insecure");
  },
    
  msgops_callback_still_secure: function(opdata,context,is_reply){
        Module["ops_event"](opdata,{},"still_secure");
  },

  msgops_callback_log_message: function(opdata,message){
    Module["ops_event"](opdata,{
        "message":Pointer_stringify(message)
    },"log_message");
  },

  msgops_callback_max_message_size:function(opdata,context){
        return Module["ops_event"](opdata,{},"max_message_size");
  },

  msgops_callback_account_name:function(opdata,account,protocol){
        return account;
  },

  msgops_callback_account_name_free:function(opdata,account,protocol){
        return;
  },
    
  msgops_callback_smp_request: function(opdata,context,question){
        var obj = (new Module["ConnContext"](context))["obj"]();
        if(question!=0) obj["question"] = Pointer_stringify(question);
        Module["ops_event"](opdata, obj, "smp_request");
  },
    
  msgops_callback_smp_failed: function(opdata,context){
        Module["ops_event"](opdata, (new Module["ConnContext"](context))["obj"](),"smp_failed");
  },
    
  msgops_callback_smp_aborted: function($opdata,$context){
        Module["ops_event"](opdata, (new Module["ConnContext"](context))["obj"](),"smp_aborted");
  },
    
  msgops_callback_smp_complete: function(opdata,context){
        Module["ops_event"](opdata, (new Module["ConnContext"](context))["obj"](),"smp_complete");
  },
    
  msgops_callback_smp_error: function(opdata,context){
        Module["ops_event"](opdata, (new Module["ConnContext"](context))["obj"](),"smp_error");    
  },

  msgops_callback_remote_disconnected: function(opdata,context){
    Module["ops_event"](opdata, (new Module["ConnContext"](context))["obj"](),"remote_disconnected");
  },

});

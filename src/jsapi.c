#include "jsapi.h"

void jsapi_initialise(){
    /* Version check should be the very first call because it
          makes sure that important subsystems are intialized. */
	if (!gcry_check_version (GCRYPT_VERSION))
    {
      fputs ("=!= libgcrypt version mismatch\n", stderr);
      exit (2);
    }

    gcry_control (GCRYCTL_INITIALIZATION_FINISHED, 0);
    OTRL_INIT;
}

OtrlPrivKey* jsapi_userstate_get_privkey_root(OtrlUserState us){
    return us->privkey_root;
}
OtrlPrivKey* jsapi_privkey_get_next(OtrlPrivKey* p){
    return p->next;
}
char* jsapi_privkey_get_accountname(OtrlPrivKey* p){
    return p->accountname;
}
char* jsapi_privkey_get_protocol(OtrlPrivKey* p){
    return p->protocol;
}

gcry_error_t jsapi_sexp_write(FILE *privf, gcry_sexp_t sexp)
{
    size_t buflen;
    char *buf;

    buflen = gcry_sexp_sprint(sexp, GCRYSEXP_FMT_ADVANCED, NULL, 0);
    buf = malloc(buflen);
    if (buf == NULL && buflen > 0) {
	return gcry_error(GPG_ERR_ENOMEM);
    }
    gcry_sexp_sprint(sexp, GCRYSEXP_FMT_ADVANCED, buf, buflen);
    
    fprintf(privf, "%s", buf);
    free(buf);

    return gcry_error(GPG_ERR_NO_ERROR);
}

gcry_error_t jsapi_account_write(FILE *privf, const char *accountname,
	const char *protocol, gcry_sexp_t privkey)
{
    gcry_error_t err;
    gcry_sexp_t names, protos;

    fprintf(privf, " (account\n");

    err = gcry_sexp_build(&names, NULL, "(name %s)", accountname);
    if (!err) {
	err = jsapi_sexp_write(privf, names);
	gcry_sexp_release(names);
    }
    if (!err) err = gcry_sexp_build(&protos, NULL, "(protocol %s)", protocol);
    if (!err) {
	err = jsapi_sexp_write(privf, protos);
	gcry_sexp_release(protos);
    }
    if (!err) err = jsapi_sexp_write(privf, privkey);

    fprintf(privf, " )\n");

    return err;
}

gcry_error_t jsapi_userstate_write_to_file(OtrlUserState us, const char *filename){
    gcry_error_t err = GPG_ERR_NO_ERROR;
    FILE *privf;
    OtrlPrivKey *p;
    mode_t oldmask;
    oldmask = umask(077);

    privf = fopen(filename, "w+b");

    if (!privf) {
        umask(oldmask);
    	err = gcry_error_from_errno(errno);
    	return err;
    }

    /* Output all the keys we know ...*/
    fprintf(privf, "(privkeys\n");

    for (p=us->privkey_root; p; p=p->next) {
	    jsapi_account_write(privf, p->accountname, p->protocol, p->privkey);
    }

    fprintf(privf, ")\n");
    fseek(privf, 0, SEEK_SET);
    fclose(privf);
    umask(oldmask);
    return err;
}

gcry_error_t jsapi_privkey_delete(OtrlUserState us, const char *filename,
	const char *accountname, const char *protocol)
{
    gcry_error_t err = GPG_ERR_NO_ERROR;
    
    /* remove key from userstate */
    OtrlPrivKey* existing_key = otrl_privkey_find(us,accountname,protocol);
    if( existing_key ){
        otrl_privkey_forget(existing_key);
        err = jsapi_userstate_write_to_file(us, filename);//write out the changes
    }
    return err;
 
}
gcry_error_t
jsapi_privkey_get_dsa_token(OtrlPrivKey *keyToExport, const char* token, 
            unsigned char *buffer, size_t buflen, size_t *nbytes)
{
    gcry_error_t err;
    gcry_mpi_t x;
    gcry_sexp_t dsas,xs;
    size_t nx;
    
    gcry_sexp_t privkey = keyToExport->privkey;

    dsas = gcry_sexp_find_token(privkey, "dsa", 0);
    if (dsas == NULL) {
        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    }

    xs = gcry_sexp_find_token(dsas, token, 0);
    gcry_sexp_release(dsas);
    
    if (!xs) return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    
    x = gcry_sexp_nth_mpi(xs, 1, GCRYMPI_FMT_USG);
    gcry_sexp_release(xs);

    if (!x) return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    
    err =  gcry_mpi_print(GCRYMPI_FMT_HEX, buffer,buflen,nbytes,x);
    gcry_mpi_release(x);
    return err;
}
//copy of make_pubkey() from libotr3.2.1/src/privkey.c 
/* Create a public key block from a private key */
gcry_error_t jsapi_make_pubkey(unsigned char **pubbufp, size_t *publenp,
	gcry_sexp_t privkey)
{
    gcry_mpi_t p,q,g,y;
    gcry_sexp_t dsas,ps,qs,gs,ys;
    size_t np,nq,ng,ny;
    enum gcry_mpi_format format = GCRYMPI_FMT_USG;
    unsigned char *bufp;
    size_t lenp;

    *pubbufp = NULL;
    *publenp = 0;

    /* Extract the public parameters */
    dsas = gcry_sexp_find_token(privkey, "dsa", 0);
    if (dsas == NULL) {
	return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    }
    ps = gcry_sexp_find_token(dsas, "p", 0);
    qs = gcry_sexp_find_token(dsas, "q", 0);
    gs = gcry_sexp_find_token(dsas, "g", 0);
    ys = gcry_sexp_find_token(dsas, "y", 0);
    gcry_sexp_release(dsas);
    if (!ps || !qs || !gs || !ys) {
	gcry_sexp_release(ps);
	gcry_sexp_release(qs);
	gcry_sexp_release(gs);
	gcry_sexp_release(ys);
	return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    }
    p = gcry_sexp_nth_mpi(ps, 1, GCRYMPI_FMT_USG);
    gcry_sexp_release(ps);
    q = gcry_sexp_nth_mpi(qs, 1, GCRYMPI_FMT_USG);
    gcry_sexp_release(qs);
    g = gcry_sexp_nth_mpi(gs, 1, GCRYMPI_FMT_USG);
    gcry_sexp_release(gs);
    y = gcry_sexp_nth_mpi(ys, 1, GCRYMPI_FMT_USG);
    gcry_sexp_release(ys);
    if (!p || !q || !g || !y) {
	gcry_mpi_release(p);
	gcry_mpi_release(q);
	gcry_mpi_release(g);
	gcry_mpi_release(y);
	return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    }

    *publenp = 0;
    gcry_mpi_print(format, NULL, 0, &np, p);
    *publenp += np + 4;
    gcry_mpi_print(format, NULL, 0, &nq, q);
    *publenp += nq + 4;
    gcry_mpi_print(format, NULL, 0, &ng, g);
    *publenp += ng + 4;
    gcry_mpi_print(format, NULL, 0, &ny, y);
    *publenp += ny + 4;

    *pubbufp = malloc(*publenp);
    if (*pubbufp == NULL) {
	gcry_mpi_release(p);
	gcry_mpi_release(q);
	gcry_mpi_release(g);
	gcry_mpi_release(y);
	return gcry_error(GPG_ERR_ENOMEM);
    }
    bufp = *pubbufp;
    lenp = *publenp;

    write_mpi(p,np,"P");
    write_mpi(q,nq,"Q");
    write_mpi(g,ng,"G");
    write_mpi(y,ny,"Y");

    gcry_mpi_release(p);
    gcry_mpi_release(q);
    gcry_mpi_release(g);
    gcry_mpi_release(y);

    return gcry_error(GPG_ERR_NO_ERROR);
}


gcry_error_t jsapi_userstate_import_privkey(OtrlUserState us, char *accountname, char * protocol, 
                    gcry_mpi_t p, gcry_mpi_t q, gcry_mpi_t g, gcry_mpi_t y, gcry_mpi_t x){

    size_t *erroff;
    const char *token;
    size_t tokenlen;
    gcry_error_t err;
    gcry_sexp_t allkeys;
    size_t i;
    
    //puts("jsapi_userstate_import_privkey: building sexp");
    
    err = gcry_sexp_build(&allkeys,erroff,"(privkeys (account (name %s) (protocol %s) (private-key (dsa \
        (p %M) (q %M) (g %M) (y %M) (x %M) ))))",accountname,protocol,p,q,g,y,x);

    if(err) return err;
    
    /* forget existing account/key */
    OtrlPrivKey* existing_key = otrl_privkey_find(us,accountname,protocol);
    if( existing_key) otrl_privkey_forget(existing_key);
    
    //puts("getting allkeys from sexp");
    
    token = gcry_sexp_nth_data(allkeys, 0, &tokenlen);
    if (tokenlen != 8 || strncmp(token, "privkeys", 8)) {
	    gcry_sexp_release(allkeys);
	    return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
    }
    
    /* Get each account */
    for(i=1; i<gcry_sexp_length(allkeys); ++i) {
        
	    gcry_sexp_t names, protos, privs;
	    char *name, *proto;
	    gcry_sexp_t accounts;
	    OtrlPrivKey *p;
	    
	    //printf("reading account #:%d\n",i);
	    /* Get the ith "account" S-exp */
	    accounts = gcry_sexp_nth(allkeys, i);
	
	    /* It's really an "account" S-exp? */
	    token = gcry_sexp_nth_data(accounts, 0, &tokenlen);
	    if (tokenlen != 7 || strncmp(token, "account", 7)) {
	        gcry_sexp_release(accounts);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
	    }
	    
	    /* Extract the name, protocol, and privkey S-exps */
	    names = gcry_sexp_find_token(accounts, "name", 0);
	    protos = gcry_sexp_find_token(accounts, "protocol", 0);
	    privs = gcry_sexp_find_token(accounts, "private-key", 0);
	    gcry_sexp_release(accounts);
	    if (!names || !protos || !privs) {
	        gcry_sexp_release(names);
	        gcry_sexp_release(protos);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
	    }
	    /* Extract the actual name and protocol */
	    token = gcry_sexp_nth_data(names, 1, &tokenlen);
	    if (!token) {
	        gcry_sexp_release(names);
	        gcry_sexp_release(protos);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
	    }
	    name = malloc(tokenlen + 1);
	    if (!name) {
	        gcry_sexp_release(names);
	        gcry_sexp_release(protos);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_ENOMEM);
	    }
	    memmove(name, token, tokenlen);
	    name[tokenlen] = '\0';
	    gcry_sexp_release(names);

	    token = gcry_sexp_nth_data(protos, 1, &tokenlen);
	    if (!token) {
	        free(name);
	        gcry_sexp_release(protos);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
	    }
	    proto = malloc(tokenlen + 1);
	    if (!proto) {
	        free(name);
	        gcry_sexp_release(protos);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_ENOMEM);
	    }
	    memmove(proto, token, tokenlen);
	    proto[tokenlen] = '\0';
	    gcry_sexp_release(protos);

	    /* Make a new OtrlPrivKey entry */
	    p = malloc(sizeof(*p));
	    if (!p) {
	        free(name);
	        free(proto);
	        gcry_sexp_release(privs);
	        gcry_sexp_release(allkeys);
	        return gcry_error(GPG_ERR_ENOMEM);
	    }

	    /* Fill it in and link it up */
	    p->accountname = name;
	    p->protocol = proto;
	    p->pubkey_type = OTRL_PUBKEY_TYPE_DSA;
	    p->privkey = privs;
	    p->next = us->privkey_root;
	    if (p->next) {
	        p->next->tous = &(p->next);
	    }
	    p->tous = &(us->privkey_root);
	    us->privkey_root = p;
	    err = jsapi_make_pubkey(&(p->pubkey_data), &(p->pubkey_datalen), p->privkey);
	    if (err) {
	        gcry_sexp_release(allkeys);
	        otrl_privkey_forget(p);
	        return gcry_error(GPG_ERR_UNUSABLE_SECKEY);
	    }
    }
    gcry_sexp_release(allkeys);
    
    /* application should write out userstate to disk */
    return gcry_error(GPG_ERR_NO_ERROR);
}

char* jsapi_conncontext_get_protocol(ConnContext* ctx){
    return ctx->protocol;
}
char* jsapi_conncontext_get_username(ConnContext* ctx){
    return ctx->username;
}
char* jsapi_conncontext_get_accountname(ConnContext* ctx){
    return ctx->accountname;
}
int jsapi_conncontext_get_msgstate(ConnContext* ctx){
    return ctx->msgstate;
}
int jsapi_conncontext_get_protocol_version(ConnContext* ctx){
    return ctx->protocol_version;
}
int jsapi_conncontext_get_smstate(ConnContext* ctx){
    return ctx->smstate->sm_prog_state;
}
void jsapi_conncontext_get_active_fingerprint(ConnContext* ctx, char* human){
    human[0]='\0';
    if(ctx->active_fingerprint==NULL) return;
    otrl_privkey_hash_to_human(human, ctx->active_fingerprint->fingerprint);
}
char* jsapi_conncontext_get_trust(ConnContext* ctx){
    if(ctx->active_fingerprint == NULL) return NULL;
    return ctx->active_fingerprint->trust;
}

OtrlMessageAppOps* jsapi_messageappops_new(){

    OtrlMessageAppOps *ops = malloc(sizeof(OtrlMessageAppOps));

    ops->policy = msgops_callback_policy;
    ops->create_privkey = msgops_callback_create_privkey;
    ops->is_logged_in = msgops_callback_is_logged_in;
    ops->inject_message = msgops_callback_inject_message;
    ops->notify = msgops_callback_notify;
    ops->display_otr_message = msgops_callback_display_otr_message;
    ops->update_context_list = msgops_callback_update_context_list;
    ops->protocol_name = msgops_callback_protocol_name;
    ops->protocol_name_free = msgops_callback_protocol_name_free;
    ops->new_fingerprint = msgops_callback_new_fingerprint;
    ops->write_fingerprints = msgops_callback_write_fingerprints;
    ops->gone_secure = msgops_callback_gone_secure;
    ops->gone_insecure = msgops_callback_gone_insecure;
    ops->still_secure = msgops_callback_still_secure;
    ops->log_message = msgops_callback_log_message;
    ops->max_message_size = msgops_callback_max_message_size;
    //ops->max_message_size = NULL;//disables fragmentation!
    ops->account_name_free = msgops_callback_account_name_free;
    ops->account_name = msgops_callback_account_name;

    return ops;
}

int jsapi_message_receiving (OtrlUserState userstate,OtrlMessageAppOps *messageops, void *opsdata, 
        char *accountname, char *protocol, char *sender, char *message, char** newmessage){

  NextExpectedSMP nextMsg;
  ConnContext *context;
  OtrlTLV *tlvs = NULL;
  OtrlTLV *tlv = NULL;

  //printf("jsapi_message_receiving from %s: %s\n",sender,message);

  int status = otrl_message_receiving(userstate, messageops, opsdata,
        accountname, protocol, sender, message, newmessage, &tlvs,NULL,NULL);

  context = otrl_context_find(userstate, sender, accountname, protocol, 0, NULL, NULL, NULL);

  //below incoming tlv processing code borrowed from pidgin-otr-3.2.1/otr-plugin.c

 if (context) {
  //LOOK FOR REMOTE SIDE DISCONNECT
  tlv = otrl_tlv_find(tlvs, OTRL_TLV_DISCONNECTED);
  if(tlv){
    msgops_callback_remote_disconnected(opsdata,context);
  }else{
    //LOOK FOR SMP TLVs
	nextMsg = context->smstate->nextExpected;

    if (context->smstate->sm_prog_state == OTRL_SMP_PROG_CHEATED) {
        //puts("message receiving OTRL_SMP_PROG_CHEATED!");
        msgops_callback_smp_failed(opsdata, context);
	    otrl_message_abort_smp(userstate, messageops, opsdata, context);
	    context->smstate->nextExpected = OTRL_SMP_EXPECT1;
	    context->smstate->sm_prog_state = OTRL_SMP_PROG_OK;

	} else {
	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP1Q);
	    if (tlv) {
            //puts("OTRL_TLV_SMP1Q");
		    if (nextMsg != OTRL_SMP_EXPECT1){
    		      otrl_message_abort_smp(userstate, messageops, opsdata, context);
                      msgops_callback_smp_aborted(opsdata, context);
	    	}else {
    		    char *question = (char *)tlv->data;
    		    char *eoq = (char*)memchr(question, '\0', tlv->len);
    		    if (eoq) {
        			msgops_callback_smp_request(opsdata,context,question);
    		    }
    		}
	    }

	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP1);
	    if (tlv) {
            //puts("OTRL_TLV_SMP1");
		    if (nextMsg != OTRL_SMP_EXPECT1){
    		    otrl_message_abort_smp(userstate, messageops, opsdata, context);
                    msgops_callback_smp_aborted(opsdata, context);
    		}else {
	             msgops_callback_smp_request(opsdata,context,NULL);
    		}
	    }

	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP2);
	    if (tlv) {
            //puts("OTRL_TLV_SMP2");
		    if (nextMsg != OTRL_SMP_EXPECT2){
    		    otrl_message_abort_smp(userstate, messageops, opsdata, context);
                    msgops_callback_smp_aborted(opsdata, context);
            }else {
    		    context->smstate->nextExpected = OTRL_SMP_EXPECT4;
	    	}
	    }

	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP3);
	    if (tlv) {
            //puts("OTRL_TLV_SMP3");
		    if (nextMsg != OTRL_SMP_EXPECT3){
    		    otrl_message_abort_smp(userstate, messageops, opsdata, context);
	                msgops_callback_smp_aborted(opsdata, context);
    		}else {
    		    context->smstate->nextExpected = OTRL_SMP_EXPECT1;
                if(context->smstate->sm_prog_state==1) msgops_callback_smp_complete(opsdata, context);
                else msgops_callback_smp_failed(opsdata, context);
    		}
	    }

	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP4);
	    if (tlv) {
            //puts("OTRL_TLV_SMP4");
            if (nextMsg != OTRL_SMP_EXPECT4){
    		    otrl_message_abort_smp(userstate, messageops, opsdata, context);
		    msgops_callback_smp_aborted(opsdata, context);
    		}else {
                context->smstate->nextExpected = OTRL_SMP_EXPECT1;
                if(context->smstate->sm_prog_state==1) msgops_callback_smp_complete(opsdata, context);
                else msgops_callback_smp_failed(opsdata, context);
    		}
	    }

	    tlv = otrl_tlv_find(tlvs, OTRL_TLV_SMP_ABORT);
	    if (tlv) {
            //puts("OTRL_TLV_SMP_ABORT");
    		context->smstate->nextExpected = OTRL_SMP_EXPECT1;
                msgops_callback_smp_aborted(opsdata, context);
	    }
	}//if SMP TLVs
  }//if disconnect TLV

 }else{
  //puts("message receving but no valid context!");
 }

 if(tlvs!=NULL) otrl_tlv_free(tlvs);
 return status;
}

int jsapi_can_start_smp(ConnContext* ctx){
    if (ctx->smstate->nextExpected == OTRL_SMP_EXPECT1 ) return 1;
    return 0;
}

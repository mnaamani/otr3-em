EMCC = `./find-emcc.py`/emcc
CRYPTO_EMSCRIPTEN=$(HOME)/projects/crypto-emscripten
BUILD= build
CRYPTO_BUILD = $(CRYPTO_EMSCRIPTEN)/$(BUILD)

EXPORTED_FUNCS= -s EXPORTED_FUNCTIONS="['_gcry_strerror','_malloc','_free','__gcry_mpi_new','__gcry_mpi_set','__gcry_mpi_release', \
            '__gcry_mpi_scan','__gcry_mpi_print','_otrl_version','_otrl_userstate_create','_otrl_userstate_free', \
            '_otrl_privkey_read','_otrl_privkey_fingerprint','_otrl_privkey_read_fingerprints','_otrl_privkey_write_fingerprints', \
            '_otrl_privkey_generate', '_otrl_context_find', '_otrl_message_sending', '_otrl_message_free', '_otrl_message_fragment_and_send', \
            '_otrl_message_disconnect', '_otrl_message_initiate_smp_q', '_otrl_message_initiate_smp', '_otrl_message_respond_smp', \
            '_jsapi_message_receiving', '_jsapi_can_start_smp','_jsapi_privkey_get_next','_jsapi_privkey_get_accountname', \
            '_jsapi_privkey_get_protocol', '_jsapi_userstate_get_privkey_root', '_jsapi_conncontext_get_protocol', \
            '_jsapi_conncontext_get_username', '_jsapi_conncontext_get_accountname','_jsapi_conncontext_get_msgstate', \
            '_jsapi_conncontext_get_protocol_version', '_jsapi_conncontext_get_smstate', '_jsapi_conncontext_get_active_fingerprint', \
            '_jsapi_conncontext_get_trust', '_jsapi_initialise','_jsapi_messageappops_new','_otrl_privkey_forget','_otrl_privkey_forget_all', \
            '_otrl_privkey_find', '_jsapi_privkey_delete', '_jsapi_privkey_get_dsa_token', '_jsapi_userstate_import_privkey','_jsapi_userstate_write_to_file']"

#O2 optimisation requires --llvm-opts 1, closure will break virtual file system import/export functionality
OPTIMISATION = -O2 --closure 0 --llvm-opts 1 --minify 0 -s LINKABLE=1 $(EXPORTED_FUNCS)

module-optimised:
	mkdir -p lib/
	cp src/header.js lib/_libotr3.js
	$(EMCC) src/jsapi.c -I$(CRYPTO_BUILD)/include -lotr -L$(CRYPTO_BUILD)/lib \
        -o lib/libotr3_tmp.js \
		--pre-js src/otr_pre.js \
		-s TOTAL_MEMORY=1048576  -s TOTAL_STACK=409600 \
        $(OPTIMISATION)
	cat lib/libotr3_tmp.js >> lib/_libotr3.js
	cat src/footer.js >> lib/_libotr3.js
	mv lib/_libotr3.js lib/libotr3.js
	rm lib/libotr3_tmp.js

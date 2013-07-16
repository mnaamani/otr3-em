}).call(moduleScope);

    if (typeof exports !== 'undefined'){
	    module.exports = moduleScope.Module;
    }else{
        root.libotr3Module = moduleScope.Module;
    }

}).call();

;(function () {

    var root = this;

    if (typeof exports !== 'undefined'){

	    module.exports.getModule=function(){
		    return root.Module;
    	};
        
    }else{
    	this.getModule = function(){
            return root.Module;
        }
    }

// -- code generated by emscripten will follow ---

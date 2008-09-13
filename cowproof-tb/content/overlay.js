var Cowproof = {
    // 日本語校正 Web API の URL のデフォルト
    DEFAULT_API_URL: "http://jlp.yahooapis.jp/KouseiService/V1/kousei"
};

var CowproofTreeView = {
    rowCount: 0,
    box: null,
    resultSet : [],
    columnIdMap : { "cowproof-rt-start-pos" : "StartPos",
		    "cowproof-rt-end-pos" : "",
		    "cowproof-rt-surface" : "Surface",
		    "cowproof-rt-shiteki-word" : "ShitekiWord",
		    "cowproof-rt-shiteki-info" : "ShitekiInfo" },
    getCellText : function(row, column) {
	if (row >= this.resultSet.length) {
	    return "";
	}
	var result = this.resultSet[row];
	if (column.id == "cowproof-rt-end-pos") {
	    return result.StartPos + result.Length;
	} else if (column.id in this.columnIdMap) {
	    return this.resultSet[row][this.columnIdMap[column.id]];
	} else {
	    return "";
	}
    },
    setTree: function(box) { this.box = box; },
    isContainer: function(row) { return false; },
    isEditable: function(idx, column) { return false; },
    isSeparator: function(row) { return false; },
    isSorted: function() { return false; },
    getLevel: function(row) { return 0; },
    getImageSrc: function(row,col){ return null; },
    getRowProperties: function(row,props){},
    getCellProperties: function(row,col,props){},
    getColumnProperties: function(colid,col,props){},
    setResultSet: function(resultSet) {
	this.resultSet = resultSet;
	this.rowCount = resultSet.length;
	document.getElementById('cowproof-result-tree').view = CowproofTreeView;
	this.box.rowCountChanged(0, this.resultSet.length);
	this.box.ensureRowIsVisible(0);
    }
};

Cowproof.onLoad = function(event) {
    this.toggleMenu = document.getElementById("cowproof-menuitem");
    this.contentSplitter = document.getElementById("cowproof-content-splitter");
    this.contentBox = document.getElementById("cowproof-content-box");
    this.contentFrame = document.getElementById("content-frame");
    document.getElementById('cowproof-result-tree').view = CowproofTreeView;

    this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch2);

    // 日本語校正 Web API の URL の設定
    this.apiurl = null;
    try {
	this.apiurl = this.prefs.getCharPref("extensions.cowproof.apiurl");
    } catch (e) { /* do nothing */ }
    if (this.apiurl === null || typeof this.apiurl !== "string" || this.apiurl.substr(0, 4) !== "http") {
	this.apiurl = Cowproof.DEFAULT_API_URL;
	try {
	    this.prefs.setCharPref("extensions.cowproof.apiurl", Cowproof.DEFAULT_API_URL);
	} catch (e2) { /* do nothing */ }
    }

    this.initialized = true;
};

Cowproof.showAbout = function() {
    window.open("chrome://cowproof/content/about.xul", "", "chrome");
};

Cowproof.togglePanel = function(show) {
    var toggleOff = (show === undefined) ? (! this.contentBox.collapsed) : (! show);
    this.showPanel(!toggleOff);
};

Cowproof.showPanel = function(show) {
    this.contentSplitter.setAttribute("collapsed", (! show));
    this.contentBox.setAttribute("collapsed", (! show));
    this.toggleMenu.setAttribute("checked", (show === true));
    if (show === true) {
	Cowproof.doProofread();
    }
};

Cowproof.doProofread = function() {
    var handler = function(status, dom) {
	if(status == 200) {
	    Cowproof.writeOutErrors(dom);
	} else {
	    dump("ERROR: Cowproof.doProofread(): status = " +  status + "\n");
	    alert("Yahoo! JAPAN Webサービスとのやりとりで、エラーが発生しました。");
	}
    };
    var sentence = this.contentFrame.contentDocument.body.innerHTML;
    dump("doProofread(): sentence = [" + sentence + "]\n");
    this.proofread(handler, sentence);
};

// 日本語校正支援 Web API からかえってきた結果の DOM ツリーを表示します。
Cowproof.writeOutErrors = function(dom) {
    // DOM ツリーを解析します。解析結果は、 resultSet に入ります。
    var resultSet = [];
    if (dom.documentElement.nodeName == "ResultSet") {
	var resultSetElement = dom.documentElement;
	for (var i = 0; i < resultSetElement.childNodes.length; i++) {
	    var resultElement = resultSetElement.childNodes[i];
	    if (resultElement.nodeName == "Result") {
		var result = { StartPos: "", Length: "", Surface: "", ShitekiWord: "", ShitekiInfo: "" };
		for (var j = 0; j < resultElement.childNodes.length; j++) {
		    var e = resultElement.childNodes[j];
		    if (e.nodeName in result) {
			if (e.nodeName == "StartPos" || e.nodeName == "Length") {
			    result[e.nodeName] = parseInt(e.textContent, 10);
			} else {
			    result[e.nodeName] = e.textContent;
			}
		    }
		}
		resultSet.push(result);
	    }
	}
    }

    // 結果を表示します。
    CowproofTreeView.setResultSet(resultSet);
};

Cowproof.getAppid = function () {
    var appid = null;
    try {
	appid = this.prefs.getCharPref("extensions.cowproof.yahoo.appid");
	if (appid === "" || appid === null) {
	    throw "invalid appid";
	}
    } catch (e) {
	Cowproof.doAppidSetting();
	try {
	    appid = this.prefs.getCharPref("extensions.cowproof.yahoo.appid");
	} catch (e2) { /* do nothing */ }
    }
    return appid;
};

Cowproof.doAppidSetting = function () {
    var appid = window.prompt("Yahoo! JAPAN WebサービスのアプリケーションIDを入力してください。");
    if (appid !== null) {
	try {
	    this.prefs.setCharPref("extensions.cowproof.yahoo.appid", appid);
	} catch (e) { /* do nothing */ }
    }
};

Cowproof.proofread = function(handler, sentence) {
    var appid = Cowproof.getAppid();
    if (appid === null) {
	alert("Yahoo! JAPAN WebサービスのアプリケーションIDが登録されていません。");
	return;
    }
    var pars = "appid=" + appid + "&sentence=" + encodeURIComponent(sentence);
    var reqUrl = this.apiurl;
    var req = new XMLHttpRequest();
    req.open('POST', reqUrl, true);
    req.onreadystatechange = function (aEvt) {
	if (req.readyState == 4) {
	    handler(req.status, req.responseXML);
	}
    };
    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    req.send(pars);
};

window.addEventListener("load", function(e) { Cowproof.onLoad(e); }, false);

function setUp(){

  //messages received by this component
  //utilities.listenForMessage("content", "mainpanel", "selectorAndListData", processSelectorAndListData);
  //utilities.listenForMessage("content", "mainpanel", "nextButtonData", processNextButtonData);
  //utilities.listenForMessage("content", "mainpanel", "moreItems", moreItems);
  utilities.listenForMessage("content", "mainpanel", "scrapedData", RecorderUI.processScrapedData);
  utilities.listenForMessage("content", "mainpanel", "likelyRelation", RecorderUI.processLikelyRelation);
  
  //handle user interactions with the mainpanel
  //$("button").button(); 
  $( "#tabs" ).tabs();
  RecorderUI.setUpRecordingUI();
}

$(setUp);


/**********************************************************************
 * Guide the user through making a demonstration recording
 **********************************************************************/

var RecorderUI = (function() {
  var pub = {};

  pub.setUpRecordingUI = function(){
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#about_to_record"));
    div.find("#start_recording").click(RecorderUI.startRecording);
  };

  pub.startRecording = function(){
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#recording"));
    div.find("#stop_recording").click(RecorderUI.stopRecording);

    SimpleRecord.startRecording();
  };

  function activateButton(div, selector, handler){
    var button = div.find(selector);
    button.button();
    button.click(handler);
  }

  pub.stopRecording = function(){
    var trace = SimpleRecord.stopRecording();
    var program = ReplayScript.setCurrentTrace(trace);
    var scriptString = program.toString();
    program.relevantRelations(); // now that we have a script, let's set some processing in motion that will figure out likely relations
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#script_preview")); // let's put in the script_preview node
    var scriptPreviewDiv = div.find("#program_representation");
    DOMCreationUtilities.replaceContent(scriptPreviewDiv, $("<div>"+scriptString+"</div>")); // let's put the script string in the script_preview node

    activateButton(div, "#run", RecorderUI.run);
    activateButton(div, "#replay", RecorderUI.replayOriginal);
  };

  pub.showProgramPreview = function(){
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#script_preview")); // let's put in the script_preview node
    activateButton(div, "#run", RecorderUI.run);
    activateButton(div, "#replay", RecorderUI.replayOriginal);
    RecorderUI.updateDisplayedScript();
    RecorderUI.updateDisplayedRelations();
  };

  pub.run = function(){
    // update the panel to show pause, resume buttons
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#script_running"));

    activateButton(div, "#pause", RecorderUI.pauseRun);
    activateButton(div, "#resume", RecorderUI.resumeRun);
    div.find("#resume").button("option", "disabled", true); // shouldn't be able to resume before we even pause

    // actually start the script running
    ReplayScript.prog.run();
  };

  pub.replayOriginal = function(){
    ReplayScript.prog.replayOriginal();
  };

  pub.pauseRun = function(){
    console.log("Setting pause flag.");
    pub.userPaused = true; // next runbasicblock call will handle saving a continuation
    var div = $("#new_script_content");
    div.find("#pause").button("option", "disabled", true); // can't pause while we're paused
    div.find("#resume").button("option", "disabled", false); // can now resume
  };

  pub.resumeRun = function(){
    pub.userPaused = false;
    var div = $("#new_script_content");
    div.find("#pause").button("option", "disabled", false);
    div.find("#resume").button("option", "disabled", true);
    pub.resumeContinuation();
  };

  // during recording, when user scrapes, show the text so user gets feedback on what's happening
  var scraped = {};
  var xpaths = []; // want to show texts in the right order
  pub.processScrapedData = function(data){
    scraped[data.xpath] = data.text; // dictionary based on xpath since we can get multiple DOM events that scrape same data from same node
    xpaths.push(data.xpath);
    $div = $("#scraped_items_preview");
    $div.html("");
    for (var i = 0; i < xpaths.length; i++){
      $div.append($('<div class="first_row_elem">'+scraped[xpaths[i]]+'</div>'));
    }
  };

  pub.processLikelyRelation = function(data){
    var relationObjects = ReplayScript.prog.processLikelyRelation(data);
    pub.updateDisplayedRelations();
  };

  pub.updateDisplayedRelations = function(){
    var relationObjects = ReplayScript.prog.relations;
    $div = $("#new_script_content").find("#relations");
    $div.html("");
    for (var i = 0; i < relationObjects.length; i++){
      var $relDiv = $("<div class=relation_preview></div>");
      $div.append($relDiv);
      var relation = relationObjects[i];
      var textRelation = relation.demonstrationTimeRelationText();
      if (textRelation.length > 2){
        textRelation = textRelation.slice(0,2);
        textRelation.push(_.map(Array.apply(null, Array(textRelation[0].length)), function(){return "...";}));
      }
      var table = DOMCreationUtilities.arrayOfArraysToTable(textRelation);

      var xpaths = relation.firstRowXpathsInOrder();
      var tr = $("<tr></tr>");
      for (var j = 0; j < xpaths.length; j++){
        (function(){
          var xpath = xpaths[j];
          var columnTitle = $("<input></input>");
          columnTitle.val(relation.getParameterizeableXpathColumnObject(xpath).name);
          columnTitle.change(function(){console.log(columnTitle.val(), xpath); relation.setParameterizeableXpathNodeName(xpath, columnTitle.val()); RecorderUI.updateDisplayedScript();});
          var td = $("<td></td>");
          td.append(columnTitle);
          tr.append(td);
        })();
      }
      table.prepend(tr);
      var relationTitle = $("<input></input>");
      relationTitle.val(relation.name);
      relationTitle.change(function(){relation.name = relationTitle.val(); RecorderUI.updateDisplayedScript();});
      $relDiv.append(relationTitle);
      $relDiv.append(table);
      var saveRelationButton = $("<button>Save These Table and Column Names</button>");
      saveRelationButton.button();
      saveRelationButton.click(function(){relation.saveToServer();});
      $relDiv.append(saveRelationButton);
      var editRelationButton = $("<button>Edit This Table</button>");
      editRelationButton.button();
      editRelationButton.click(function(){relation.editSelector();});
      $relDiv.append(editRelationButton);
    }
  };

  pub.showRelationEditor = function(tabId){
    var div = $("#new_script_content");
    DOMCreationUtilities.replaceContent(div, $("#relation_editing"));
    console.log("putting in new html");
    console.log(div.html());
    console.log("****");
    var readyButton = div.find("#relation_editing_ready");
    readyButton.button();
    // once ready button clicked, we'll already have updated the relation selector info based on messages the content panel has been sending, so we can just go back to looking at the program preview
    readyButton.click(function(){
      RecorderUI.showProgramPreview();
      // we also want to close the tab...
      chrome.tabs.remove(tabId);
    });
  };

  pub.updateDisplayedRelation = function(relationObj){
    var $relDiv = $("#new_script_content").find("#output_preview");
    $relDiv.html("");

    var textRelation = relationObj.demonstrationTimeRelationText();
    var table = DOMCreationUtilities.arrayOfArraysToTable(textRelation);

    var xpaths = relationObj.firstRowXpathsInOrder();
    var tr = $("<tr></tr>");
    for (var j = 0; j < xpaths.length; j++){
      (function(){
        var xpath = xpaths[j];
        var columnTitle = $("<input></input>");
        columnTitle.val(relationObj.getParameterizeableXpathColumnObject(xpath).name);
        columnTitle.change(function(){console.log(columnTitle.val(), xpath); relationObj.setParameterizeableXpathNodeName(xpath, columnTitle.val()); RecorderUI.updateDisplayedScript();});
        var td = $("<td></td>");
        td.append(columnTitle);
        tr.append(td);
      })();
    }
    table.prepend(tr);

    var relationTitle = $("<input></input>");
    relationTitle.val(relationObj.name);
    relationTitle.change(function(){relationObj.name = relationTitle.val(); RecorderUI.updateDisplayedScript();});
    $relDiv.append(relationTitle);
    $relDiv.append(table);
  };

  pub.updateDisplayedScript = function(){
    var program = ReplayScript.prog;
    var scriptString = program.toString();
    var scriptPreviewDiv = $("#new_script_content").find("#program_representation");
    DOMCreationUtilities.replaceContent(scriptPreviewDiv, $("<div>"+scriptString+"</div>")); // let's put the script string in the script_preview node
  };

  pub.addNewRowToOutput = function(listOfCellTexts){
    var div = $("#new_script_content").find("#output_preview").find("table");
    div.append(DOMCreationUtilities.arrayOfTextsToTableRow(listOfCellTexts));
  };

  return pub;
}());

/**********************************************************************
 * Hiding the modifications to the internals of Ringer event objects
 **********************************************************************/

var EventM = (function() {
  var pub = {};

  pub.prepareForDisplay = function(ev){
    if (!ev.additionalDataTmp){ // this is where this tool chooses to store temporary data that we'll actually clear out before sending it back to r+r
      ev.additionalDataTmp = {};
    } 
    ev.additionalDataTmp.display = {};
  };

  pub.getLoadURL = function(ev){
    return ev.data.url;
  };

  pub.getDOMURL = function(ev){
    return ev.frame.topURL;
  };

  pub.getVisible = function(ev){
    return ev.additionalDataTmp.display.visible;
  };
  pub.setVisible = function(ev, val){
    ev.additionalDataTmp.display.visible = val;
  };

  pub.getLoadOutputPageVar = function(ev){
    return ev.additionalDataTmp.display.pageVarId;
  };
  pub.setLoadOutputPageVar = function(ev, val){
    ev.additionalDataTmp.display.pageVarId = val;
  };

  pub.getDOMInputPageVar = function(ev){
    return ev.additionalDataTmp.display.inputPageVar;
  };
  pub.setDOMInputPageVar = function(ev, val){
    ev.additionalDataTmp.display.inputPageVar = val;
  };

  pub.getDOMOutputLoadEvents = function(ev){
    return ev.additionalDataTmp.display.causesLoads;
  };
  pub.setDOMOutputLoadEvents = function(ev, val){
    ev.additionalDataTmp.display.causesLoads = val;
  };
  pub.addDOMOutputLoadEvent = function(ev, val){
    ev.additionalDataTmp.display.causesLoads.push(val);
  };

  pub.getLoadCausedBy = function(ev){
    return ev.additionalDataTmp.display.causedBy;
  };
  pub.setLoadCausedBy = function(ev, val){
    ev.additionalDataTmp.display.causedBy = val;
  };

  pub.getDisplayInfo = function(ev){
    return ev.additionalDataTmp.display;
  }
  pub.clearDisplayInfo = function(ev){
    delete ev.additionalDataTmp.display;
  }
  pub.setDisplayInfo = function(ev, displayInfo){
    ev.additionalDataTmp.display = displayInfo;
  }

  pub.setTemporaryStatementIdentifier = function(ev, id){
    if (!ev.additional){
      // not a dom event, can't copy this stuff around
      return null;
    }
    ev.additional.___additionalData___.temporaryStatementIdentifier = id; // this is where the r+r layer lets us store data that will actually be copied over to the new events (for dom events);  recall that it's somewhat unreliable because of cascading events; sufficient for us because cascading events will appear in the same statement, so can have same statement id, but be careful
  }
  pub.getTemporaryStatementIdentifier = function(ev){
    if (!ev.additional){
      // not a dom event, can't copy this stuff around
      return null;
    }
    return ev.additional.___additionalData___.temporaryStatementIdentifier;
  }

  return pub;
}());

/**********************************************************************
 * Manipulations of whole scripts
 **********************************************************************/

var ReplayScript = (function() {
  var pub = {};

  pub.trace = null;
  pub.prog = null;

  // controls the sequence of transformations we do when we get a trace

  pub.setCurrentTrace = function(trace){
    console.log(trace);
    trace = processTrace(trace);
    trace = prepareForDisplay(trace);
    trace = markUnnecessaryLoads(trace);
    trace = associateNecessaryLoadsWithIDs(trace);
    trace = parameterizePages(trace);
    trace = addCausalLinks(trace);
    pub.trace = trace;

    segmentedTrace = segment(trace);
    var prog = segmentedTraceToProgram(segmentedTrace);
    pub.prog = prog;
    return prog;
  }

  // functions for each transformation

  function processTrace(trace){
    trace = sanitizeTrace(trace);
    return trace;
  }

  // strip out the 'stopped' events
  function sanitizeTrace(trace){
    return _.filter(trace, function(obj){return obj.state !== "stopped";});
  }

  function prepareForDisplay(trace){
    _.each(trace, function(ev){EventM.prepareForDisplay(ev);});
    return trace;
  }

  // user doesn't need to see load events for loads that load URLs whose associated DOM trees the user never actually uses
  function markUnnecessaryLoads(trace){
    var domEvents =  _.filter(trace, function(ev){return ev.type === "dom";});
    var domEventURLs = _.unique(_.map(domEvents, function(ev){return EventM.getDOMURL(ev);}));
    _.each(trace, function(ev){if (ev.type === "completed" && domEventURLs.indexOf(EventM.getLoadURL(ev)) > -1){ EventM.setVisible(ev, true);}});
    return trace;
  }

  var frameToPageVarId = {};
  function associateNecessaryLoadsWithIDs(trace){
    var idCounter = 1; // blockly says not to count from 0
    _.each(trace, function(ev){if (ev.type === "completed" && EventM.getVisible(ev)){ var p = new WebAutomationLanguage.PageVariable("p"+idCounter, EventM.getLoadURL(ev)); EventM.setLoadOutputPageVar(ev, p); frameToPageVarId[EventM.getLoadURL(ev)] = p; idCounter += 1;}});
    return trace;
  }

  function parameterizePages(trace){
    _.each(trace, function(ev){if (ev.type === "dom"){ var p = frameToPageVarId[EventM.getDOMURL(ev)]; EventM.setDOMInputPageVar(ev, p); p.setRecordTimeFrameData(ev.frame); }});
    return trace;
  }

  function addCausalLinks(trace){
    lastDOMEvent = null;
    _.each(trace, function(ev){
      if (ev.type === "dom"){
        lastDOMEvent = ev;
        EventM.setDOMOutputLoadEvents(ev, []);
      }
      else if (lastDOMEvent !== null && ev.type === "completed" && EventM.getVisible(ev)) {
        EventM.setLoadCausedBy(ev, lastDOMEvent);
        EventM.addDOMOutputLoadEvent(lastDOMEvent, ev);
        // now that we have a cause for the load event, we can make it invisible
        EventM.setVisible(ev);
      }
    });
    return trace;
  }

  // helper function.  returns whether two events should be allowed in the same statement, based on visibility, statement type, statement page, statement target
  function allowedInSameSegment(e1, e2){
    // if either of them is null (as when we do not yet have a current visible event), anything goes
    if (e1 === null || e2 === null){
      return true;
    }
    var e1type = WebAutomationLanguage.statementType(e1);
    var e2type = WebAutomationLanguage.statementType(e2);
    // if either is invisible, can be together, because an invisible event allowed anywhere
    if (e1type === null || e2type === null){
      return true;
    }
    // now we know they're both visible
    // visible load events aren't allowed to share with any other visible events
    if (e1.type === "completed" || e2.type === "completed"){
      return false;
    }
    // now we know they're both visible and both dom events
    // if they're both visible, but have the same type and called on the same node, they're allowed together
    if (e1type === e2type){
      var e1page = EventM.getDOMInputPageVar(e1);
      var e2page = EventM.getDOMInputPageVar(e2);
      if (e1page === e2page){
        var e1node = e1.target.xpath;
        var e2node = e2.target.xpath;
        if (e1node === e2node){
          return true;
        }
      }
    }
    return false;
  }

  function segment(trace){
    var allSegments = [];
    var currentSegment = [];
    var currentSegmentVisibleEvent = null; // an event that should be shown to the user and thus determines the type of the statement
    _.each(trace, function(ev){
      if (allowedInSameSegment(currentSegmentVisibleEvent, ev)){
        currentSegment.push(ev);
        if (currentSegmentVisibleEvent === null && WebAutomationLanguage.statementType(ev) !== null ){ // only relevant to first segment
          currentSegmentVisibleEvent = ev;
        }
      }
      else{
        // the current event isn't allowed in last segment -- maybe it's on a new node or a new type of action.  need a new segment
        allSegments.push(currentSegment);
        currentSegment = [ev];
        currentSegmentVisibleEvent = ev; // if this were an invisible event, we wouldn't have needed to start a new block, so it's always ok to put this in for the current segment's visible event
      }});
    allSegments.push(currentSegment); // put in that last segment
    return allSegments;
  }

  function segmentedTraceToProgram(segmentedTrace){
    var statements = [];
    _.each(segmentedTrace, function(seg){
      sType = null;
      for (var i = 0; i < seg.length; i++){
        var ev = seg[i];
        var st = WebAutomationLanguage.statementType(ev);
        if (st !== null){
          sType = st;
          if (sType === StatementTypes.LOAD){
            statements.push(new WebAutomationLanguage.LoadStatement(seg));
          }
          else if (sType === StatementTypes.MOUSE){
            statements.push(new WebAutomationLanguage.ClickStatement(seg));
          }
          else if (sType === StatementTypes.SCRAPE){
            statements.push(new WebAutomationLanguage.ScrapeStatement(seg));
          }
          else if (sType === StatementTypes.KEYBOARD){
            statements.push(new WebAutomationLanguage.TypeStatement(seg));
          }
          break;
        }
      }
    });
    return new WebAutomationLanguage.Program(statements);
  }

  return pub;
}());

/**********************************************************************
 * Our high-level automation language
 **********************************************************************/

var StatementTypes = {
  MOUSE: "click",
  KEYBOARD: "type",
  LOAD: "load",
  SCRAPE: "extract"
};

var WebAutomationLanguage = (function() {
  var pub = {};

  var statementToEventMapping = {
    mouse: ['click','dblclick','mousedown','mousemove','mouseout','mouseover','mouseup'],
    keyboard: ['keydown','keyup','keypress','textinput','paste','input']
  };

  // helper function.  returns the StatementType (see above) that we should associate with the argument event, or null if the event is invisible
  pub.statementType = function(ev){
    if (ev.type === "completed"){
      if (!EventM.getVisible(ev)){
        return null; // invisible, so we don't care where this goes
      }
      return StatementTypes.LOAD;
    }
    else if (ev.type === "dom"){
      if (statementToEventMapping.mouse.indexOf(ev.data.type) > -1){
        if (ev.additional.scrape){
          return StatementTypes.SCRAPE
        }
        return StatementTypes.MOUSE;
      }
      else if (statementToEventMapping.keyboard.indexOf(ev.data.type) > -1){
        if ([16, 17, 18].indexOf(ev.data.keyCode) > -1){
          // this is just shift, ctrl, or alt key.  don't need to show these to the user
          return null;
        }
        return StatementTypes.KEYBOARD;
      }
    }
    return null; // these events don't matter to the user, so we don't care where this goes
  }

  function firstVisibleEvent(trace){
    for (var i = 0; i < trace.length; i++){
      var ev = trace[i];
      var st = WebAutomationLanguage.statementType(ev);
      if (st !== null){
        return ev;
      }
    }
  }

  // helper functions that some statements will use

  function nodeRepresentation(statement){
    if (statement.currentNode instanceof WebAutomationLanguage.VariableUse){
      return statement.currentNode.toString();
    }
    return "<img src='"+statement.trace[0].additional.visualization+"'>";
  }

  function outputPagesRepresentation(statement){
    var prefix = "";
    if (statement.outputPageVars.length > 0){
      prefix = _.map(statement.outputPageVars, function(pv){return pv.toString();}).join(", ")+" = ";
    }
    return prefix;
  }

  function parameterizeNodeWithRelation(statement, relation, pageVar){
      var xpaths = relation.parameterizeableXpaths();
      var index = xpaths.indexOf(statement.currentNode);
      if (index > -1){
        statement.currentNode = new WebAutomationLanguage.VariableUse(relation.getParameterizeableXpathColumnObject(xpaths[index]), relation, pageVar);
      }
  }

  function currentNodeXpath(statement){
    if (statement.currentNode instanceof WebAutomationLanguage.VariableUse){
      return statement.currentNode.currentValue();
    }
    return statement.currentNode; // this means currentNode better be an xpath if it's not a variable use!
  }

  function currentTab(statement){
    return statement.pageVar.currentTabId();
  }

  function originalTab(statement){
    return statement.pageVar.originalTabId();
  }

  function cleanTrace(trace){
    var cleanTrace = [];
    for (var i = 0; i < trace.length; i++){
      var displayData = EventM.getDisplayInfo(trace[i]);
      EventM.clearDisplayInfo(trace[i]);
      cleanTrace.push(clone(trace[i]));
      // now restore the true trace object
      EventM.setDisplayInfo(trace[i], displayData);
    }
    return cleanTrace;
  }

  // the actual statements

  pub.LoadStatement = function(trace){
    this.trace = trace;

    // find the record-time constants that we'll turn into parameters
    var ev = firstVisibleEvent(trace);
    this.url = ev.data.url;
    this.outputPageVar = EventM.getLoadOutputPageVar(ev);
    // for now, assume the ones we saw at record time are the ones we'll want at replay
    this.currentUrl = this.url;

    // usually 'completed' events actually don't affect replayer -- won't load a new page in a new tab just because we have one.  want to tell replayer to actually do a load
    ev.forceReplay = true;

    this.cleanTrace = cleanTrace(trace);

    this.toStringLines = function(){
      return [this.outputPageVar.toString()+" = load('"+this.url+"')"];
    };

    this.pbvs = function(){
      var pbvs = [];
      if (this.url !== this.currentUrl){
        pbvs.push({type:"url", value: this.url});
      }
      return pbvs;
    };

    this.parameterizeForRelation = function(){
      return; // loads don't get changed based on relations
    };

    this.args = function(){
      var args = [];
      args.push({type:"url", value: this.currentUrl});
      return args;
    };

    this.postReplayProcessing = function(trace, temporaryStatementIdentifier){
      return;
    };
  };
  pub.ClickStatement = function(trace){
    this.trace = trace;
    this.cleanTrace = cleanTrace(trace);

    // find the record-time constants that we'll turn into parameters
    var ev = firstVisibleEvent(trace);
    this.pageVar = EventM.getDOMInputPageVar(ev);
    this.pageUrl = ev.frame.topURL;
    this.node = ev.target.xpath;
    var domEvents = _.filter(trace, function(ev){return ev.type === "dom";}); // any event in the segment may have triggered a load
    var outputLoads = _.reduce(domEvents, function(acc, ev){return acc.concat(EventM.getDOMOutputLoadEvents(ev));}, []);
    this.outputPageVars = _.map(outputLoads, function(ev){return EventM.getLoadOutputPageVar(ev);});
    // for now, assume the ones we saw at record time are the ones we'll want at replay
    this.currentNode = this.node;

    this.toStringLines = function(){
      var nodeRep = nodeRepresentation(this);
      return [outputPagesRepresentation(this)+"click("+this.pageVar.toString()+", "+nodeRep+")"];
    };

    this.pbvs = function(){
      var pbvs = [];
      pbvs.push({type:"tab", value: originalTab(this)});
      if (this.node !== this.currentNode){
        pbvs.push({type:"node", value: this.node});
      }
      return pbvs;
    };

    this.parameterizeForRelation = function(relation){
      parameterizeNodeWithRelation(this, relation, this.pageVar);
    };

    this.args = function(){
      var args = [];
      args.push({type:"tab", value: currentTab(this)});
      args.push({type:"node", value: currentNodeXpath(this)});
      return args;
    };

    this.postReplayProcessing = function(trace, temporaryStatementIdentifier){
      return;
    };
  };
  pub.ScrapeStatement = function(trace){
    this.trace = trace;
    this.cleanTrace = cleanTrace(trace);

    // find the record-time constants that we'll turn into parameters
    var ev = firstVisibleEvent(trace);
    this.pageVar = EventM.getDOMInputPageVar(ev);
    this.node = ev.target.xpath;
    this.pageUrl = ev.frame.topURL;
    // for now, assume the ones we saw at record time are the ones we'll want at replay
    this.currentNode = this.node;

    this.toStringLines = function(){
      var nodeRep = nodeRepresentation(this);
      return ["scrape("+this.pageVar.toString()+", "+nodeRep+")"];
    };

    this.pbvs = function(){
      var pbvs = [];
      pbvs.push({type:"tab", value: originalTab(this)});
      if (this.node !== this.currentNode){
        pbvs.push({type:"node", value: this.node});
      }
      return pbvs;
    };

    this.parameterizeForRelation = function(relation){
      parameterizeNodeWithRelation(this, relation, this.pageVar);
    };

    this.args = function(){
      var args = [];
      args.push({type:"node", value: currentNodeXpath(this)});
      args.push({type:"tab", value: currentTab(this)});
      return args;
    };

    this.postReplayProcessing = function(trace, temporaryStatementIdentifier){
      // find the scrape that corresponds to this scrape statement based on temporarystatementidentifier
      for (var i = 0; i < trace.length; i++){
        if (EventM.getTemporaryStatementIdentifier(trace[i]) === temporaryStatementIdentifier && trace[i].additional && trace[i].additional.scrape && trace[i].additional.scrape.text){
          this.currentNodeCurrentValue = trace[i].additional.scrape.text;
          return;
        }
      }
    };
  };
  pub.TypeStatement = function(trace){
    this.trace = trace;
    this.cleanTrace = cleanTrace(trace);

    // find the record-time constants that we'll turn into parameters
    var ev = firstVisibleEvent(trace);
    this.pageVar = EventM.getDOMInputPageVar(ev);
    this.node = ev.target.xpath;
    this.pageUrl = ev.frame.topURL;
    var textEntryEvents = _.filter(trace, function(ev){statementToEventMapping.keyboard.indexOf(WebAutomationLanguage.statementType(ev)) > -1;});
    var lastTextEntryEvent = textEntryEvents[-1];
    this.typedString = ev.meta.deltas.value;
    var domEvents = _.filter(trace, function(ev){return ev.type === "dom";}); // any event in the segment may have triggered a load
    var outputLoads = _.reduce(domEvents, function(acc, ev){return acc.concat(EventM.getDOMOutputLoadEvents(ev));}, []);
    this.outputPageVars = _.map(outputLoads, function(ev){return EventM.getLoadOutputPageVar(ev);});
    // for now, assume the ones we saw at record time are the ones we'll want at replay
    this.currentNode = this.node;
    this.currentTypedString = this.typedString;

    this.toStringLines = function(){
      var nodeRep = nodeRepresentation(this);
      return [outputPagesRepresentation(this)+"type("+this.pageVar.toString()+",, "+nodeRep+", '"+this.typedString+"')"];
    };

    this.pbvs = function(){
      var pbvs = [];
      pbvs.push({type:"tab", value: originalTab(this)});
      if (this.node !== this.currentNode){
        pbvs.push({type:"node", value: this.node});
      }
      return pbvs;
    };

    this.parameterizeForRelation = function(relation){
      parameterizeNodeWithRelation(this, relation, this.pageVar);
    };

    this.args = function(){
      var args = [];
      args.push({type:"node", value: currentNodeXpath(this)});
      args.push({type:"tab", value: currentTab(this)});
      return args;
    };

    this.postReplayProcessing = function(trace, temporaryStatementIdentifier){
      return;
    };
  };

  pub.OutputRowStatement = function(scrapeStatements){
    this.trace = []; // no extra work to do in r+r layer for this
    this.cleanTrace = [];
    this.scrapeStatements = scrapeStatements;

    this.toStringLines = function(){
      var nodeRepLs = _.map(this.scrapeStatements, function(statement){return nodeRepresentation(statement);});
      return ["addOutputRow(["+nodeRepLs.join(",")+"])"];
    };

    this.pbvs = function(){
      return [];
    };
    this.parameterizeForRelation = function(relation){
      return;
    };
    this.args = function(){
      return [];
    };
    this.postReplayProcessing = function(trace, temporaryStatementIdentifier){
      // we've 'executed' an output statement.  better send a new row to our output
      var cells = [];
      _.each(this.scrapeStatements, function(scrapeStatment){
        cells.push(scrapeStatment.currentNodeCurrentValue);
      });
      RecorderUI.addNewRowToOutput(cells);
    };
  }

  pub.LoopStatement = function(relation, bodyStatements, pageVar){
    this.relation = relation;
    this.bodyStatements = bodyStatements;
    this.pageVar = pageVar;

    this.toStringLines = function(){
      var relation = this.relation;
      var varNames = _.map(relation.columnObjects, function(columnObject){return columnObject.name;});
      var prefix = "for "+varNames.join(", ")+" in "+this.pageVar.toString()+"."+this.relation.name+":";
      var statementStrings = _.reduce(this.bodyStatements, function(acc, statement){return acc.concat(statement.toStringLines());}, []);
      statementStrings = _.map(statementStrings, function(line){return ("&nbsp&nbsp&nbsp&nbsp "+line);});
      return [prefix].concat(statementStrings);
    };

    this.parameterizeForRelation = function(relation){
      _.each(this.bodyStatements, function(statement){statement.parameterizeForRelation(relation);});
    };
  }

  var relationCounter = 0;
  pub.Relation = function(relationId, name, selector, selectorVersion, excludeFirst, columns, demonstrationTimeRelation, numRowsInDemo, url){
    this.id = relationId;
    this.selector = selector;
    this.selectorVersion = selectorVersion;
    this.excludeFirst = excludeFirst;
    this.columns = columns;
    this.demonstrationTimeRelation = demonstrationTimeRelation;
    this.numRowsInDemo = numRowsInDemo;
    this.url = url;
    if (name === undefined || name === null){
      relationCounter += 1;
      this.name = "relation_"+relationCounter;
    }
    else{
      this.name = name;
    }

    this.pageRelationsInfo = {};

    var relation = this;

    this.demonstrationTimeRelationText = function(){
      return _.map(this.demonstrationTimeRelation, function(row){return _.map(row, function(cell){return cell.text;});});
    }

    this.firstRowXpathsInOrder = function(){
      console.log(relation.demonstrationTimeRelation[0]);
      console.log(_.map(relation.demonstrationTimeRelation[0], function(cell){ return cell.xpath;}));
      return this.parameterizeableXpaths();
    }

    function genParameterizeableXpaths(){
      // for now, will only parameterize on the first row
      return _.map(relation.demonstrationTimeRelation[0], function(cell){ return cell.xpath;});
    }
    var parameterizeableXpaths = genParameterizeableXpaths(); // for now we're assuming that the demonstrationtimerelation never changes in a single relation object.  if it does, we'll have to refresh this
    this.parameterizeableXpaths = function(){
      return parameterizeableXpaths;
    }

    function domain(url){
      var domain = "";
      // don't need http and so on
      if (url.indexOf("://") > -1) {
          domain = url.split('/')[2];
      }
      else {
          domain = url.split('/')[0];
      }
      domain = domain.split(':')[0]; // there can be site.com:1234 and we don't want that
      return domain;
    }

    var xpathsToColumnObjects = {};
    function processColumns(){
      console.log("columns", relation.columns);
      for (var i = 0; i < relation.columns.length; i++){
        var xpath = relation.columns[i].xpath;
        if (relation.columns[i].name === null || relation.columns[i].name === undefined){
          relation.columns[i].name = relation.name+"_item_"+(i+1); // a filler name that we'll use for now
        }
        relation.columns[i].index = i; // should later look at whether this index is good enough
        xpathsToColumnObjects[xpath] = relation.columns[i];
      }
    }
    processColumns();

    this.nameColumnsAndRelation = function(){
      // should eventually consider looking at existing columns to suggest columns names
    }
    this.nameColumnsAndRelation();

    this.getParameterizeableXpathColumnObject = function(xpath){
      return xpathsToColumnObjects[xpath];
    };
    // user can give us better names
    this.setParameterizeableXpathNodeName = function(xpath, v){
      var columnObj = xpathsToColumnObjects[xpath];
      columnObj.name = v;
    };

    this.usedByStatement = function(statement){
      if (!((statement instanceof WebAutomationLanguage.ScrapeStatement) || (statement instanceof WebAutomationLanguage.ClickStatement) || (statement instanceof WebAutomationLanguage.TypeStatement))){
        return false;
      }
      // for now we're only saying the relation is used if the nodes in the relation are used
      // todo: ultimately should also say it's used if the text contents of a node is typed
      return (this.url === statement.pageUrl && this.parameterizeableXpaths().indexOf(statement.node) > -1);
    };

    this.clearRunningState = function(){
      this.pageRelationsInfo = {};
    }

    this.getNextRow = function(pageVar, callback){ // has to be called on a page, since a relation selector can be applied to many pages.  higher-level tool must control where to apply
      // todo: this is a very simplified version that assumes there's only one page of results.  add the rest soon.

      // have to keep track of different state for relations retrieved with the same relation but on different pages
      // todo: in future may sometimes want to clear out the information in this.pageRelationsInfo.  should think about this, lest it become a memory hog
      var pname = pageVar.name;
      var prinfo = this.pageRelationsInfo[pname];
      if (prinfo === undefined || prinfo.currentTabId !== pageVar.currentTabId()){ // if we haven't seen this pagevar or haven't seen the URL currently associated with the pagevar, need to clear our state and start fresh
        prinfo = {currentRows: null, currentRowsCounter: 0, currentTabId: pageVar.currentTabId()};
        this.pageRelationsInfo[pname] = prinfo;
      }

      console.log("getnextrow", this, prinfo.currentRowsCounter);
      if (prinfo.currentRows === null){
        utilities.listenForMessageOnce("content", "mainpanel", "relationItems", function(data){
          prinfo.currentRows = data.relation;
          prinfo.currentRowsCounter = 0;
          callback(true);
        });
        utilities.sendMessage("mainpanel", "content", "getRelationItems", {selector: this.selector, selector_version: this.selectorVersion, exclude_first: this.excludeFirst, columns: this.columns}, null, null, [pageVar.currentTabId()]);
        // todo: for above.  need to figure out the appropriate tab_id
        // how should we decide on tab id?  should we just send to all tabs, have them all check if it looks listy on the relevant tab?
        // this might be useful for later attempts to apply relation finders to new pages with different urls, so user doesn't have to show them, that sort of thing
      }
      else if (prinfo.currentRowsCounter + 1 >= prinfo.currentRows.length){
        callback(false); // no more rows -- let the callback know we're done
      }
      else {
        // we still have local rows that we haven't used yet.  just advance the counter to change which is our current row
        prinfo.currentRowsCounter += 1;
        callback(true);
      }
    }

    this.getCurrentValue = function(pageVar, columnObject){
      var pname = pageVar.name;
      var prinfo = this.pageRelationsInfo[pname];
      if (prinfo === undefined){ console.log("Bad!  Shouldn't be calling getCurrentValue on a pageVar for which we haven't yet called getNextRow."); return null; }
      return prinfo.currentRows[prinfo.currentRowsCounter][columnObject.index].xpath; // in the current row, value at the index associated with nodeName
    }

    this.saveToServer = function(){
      // sample: $($.post('http://localhost:3000/saverelation', { relation: {name: "test", url: "www.test2.com/test-test2", selector: "test2", selector_version: 1, num_rows_in_demonstration: 10}, columns: [{name: "col1", xpath: "a[1]/div[1]", suffix: "div[1]"}] } ));
      // todo: this should really be stable stringified (the selector), since we'll be using it to test equality of different relations
      var rel = { relation: {name: this.name, url: this.url, selector: this.selector, selector_version: this.selectorVersion, num_rows_in_demonstration: this.numRowsInDemo}, columns: _.map(this.columns, function(colObj){return {name: colObj.name, xpath: colObj.xpath, suffix: colObj.suffix};}) };
      ServerTranslationUtilities.JSONifyRelation(rel);
      $.post('http://visual-pbd-scraping-server.herokuapp.com/saverelation', rel);
    }

    var tabReached = false;
    this.editSelector = function(){
      // show the UI for editing the selector
      // we need to open up the new tab that we'll use for showing and editing the relation, and we need to set up a listener to update the selector associated with this relation, based on changes the user makes over at the content script
      tabReached = false;
      chrome.tabs.create({url: this.url, active: true}, function(tab){
        RecorderUI.showRelationEditor(tab.id);
        var sendSelectorInfo = function(){utilities.sendMessage("mainpanel", "content", "editRelation", {selector: relation.selector, selector_version: relation.selectorVersion, exclude_first: relation.excludeFirst, columns: relation.columns}, null, null, [tab.id]);};
        var sendSelectorInfoUntilAnswer = function(){
          if (tabReached){ return; } 
          sendSelectorInfo(); 
          setTimeout(sendSelectorInfoUntilAnswer, 1000);}
        setTimeout(sendSelectorInfoUntilAnswer, 500); // give it a while to attach the listener
      });
      // now we've sent over the current selector info.  let's set up the listener that will update the preview (and the object)
      utilities.listenForMessageWithKey("content", "mainpanel", "editRelation", "editRelation", function(data){relation.selectorFromContentScript(data)}); // remember this will overwrite previous editRelation listeners, since we're providing a key
    }

    this.selectorFromContentScript = function(msg){
      tabReached = true;
      this.selector = msg.selector;
      this.selectorVersion = msg.selectorVersion;
      this.excludeFirst = msg.exclude_first;
      this.columns = msg.columns;
      this.demonstrationTimeRelation = msg.demonstration_time_relation;
      this.numRowsInDemo = msg.num_rows_in_demo;
      RecorderUI.updateDisplayedRelation(this);
    };
  }

  // todo: for now all variable uses are uses of relations, but eventually will probably want to have scraped from outside of relations too
  pub.VariableUse = function(columnObject, relation, pageVar){
    this.columnObject = columnObject;
    this.relation = relation;
    this.pageVar = pageVar;

    this.toString = function(){
      return this.columnObject.name;
    };

    this.currentValue = function(){
      return this.relation.getCurrentValue(this.pageVar, this.columnObject);
    };
  }

  pub.PageVariable = function(name, recordTimeUrl){
    this.name = name;
    this.recordTimeUrl = recordTimeUrl;

    this.setRecordTimeFrameData = function(frameData){
      this.recordTimeFrameData = frameData;
    };

    this.setCurrentTabId = function(tabId){
      this.tabId = tabId;
    };

    this.originalTabId = function(){
      console.log(this.recordTimeFrameData);
      return this.recordTimeFrameData.tab;
    }

    this.currentTabId = function(){
      return this.tabId;
    }

    this.toString = function(){
      return this.name;
    }

  };

  // the whole program

  pub.Program = function(statements){
    this.statements = statements;
    this.relations = [];
    this.loopyStatements = [];

    // add an output statement to the end if there are any scrape statements in the program.  should have a list of all scrape statements, treat them as cells in one row
    var scrapeStatements = _.filter(this.statements, function(statement){return statement instanceof WebAutomationLanguage.ScrapeStatement;});
    if (scrapeStatements.length > 0){ this.statements.push(new WebAutomationLanguage.OutputRowStatement(scrapeStatements));}

    this.toString = function(){
      var statementLs = this.loopyStatements;
      if (this.loopyStatements.length === 0){
        statementLs = this.statements;
      }
      var scriptString = "";
      _.each(statementLs, function(statement){scriptString += statement.toStringLines().join("<br>") + "<br>";});
      return scriptString;
    };

    // just for replaying the straight-line recording, primarily for debugging
    this.replayOriginal = function(){
      var trace = [];
      _.each(this.statements, function(statement){trace = trace.concat(statement.trace);});
      _.each(trace, function(ev){EventM.clearDisplayInfo(ev);}); // strip the display info back out from the event objects

      SimpleRecord.replay(trace, null, function(){console.log("Done replaying.");});
    };

    function updatePageVars(recordTimeTrace, replayTimeTrace){
      // we should see corresponding 'completed' events in the traces
      var recCompleted = _.filter(recordTimeTrace, function(ev){return ev.type === "completed";}); // todo: for now doing this for all completed events, but may ultimately want to restrict to top-level urls or some other restriction
      var repCompleted = _.filter(replayTimeTrace, function(ev){return ev.type === "completed";});
      console.log(recCompleted, repCompleted);
      // should have same number of top-level load events.  if not, might be trouble
      if (recCompleted.length !== repCompleted.length){
        console.log("Different numbers of completed events in record and replay: ", recCompleted, repCompleted);
      }
      // todo: for now aligning solely based on point at which the events appear in the trace.  if we get traces with many events, may need to do something more intelligent
      var smallerLength = recCompleted.length;
      if (repCompleted.length < smallerLength) { smallerLength = repCompleted.length;}
      for (var i = 0; i < smallerLength; i++){
        var pageVar = EventM.getLoadOutputPageVar(recCompleted[i]);
        if (pageVar === undefined){
          continue;
        }
        pageVar.setCurrentTabId(repCompleted[i].data.tabId);
      }
    }

    function runBasicBlock(loopyStatements, callback){
      console.log("rbb", loopyStatements.length, loopyStatements);
      // first check if we're supposed to pause, stop execution if yes
      console.log("RecorderUI.userPaused", RecorderUI.userPaused);
      if (RecorderUI.userPaused){
        RecorderUI.resumeContinuation = function(){runBasicBlock(loopyStatements, callback);};
        console.log("paused");
        return;
      }

      if (loopyStatements.length < 1){
        console.log("rbb: empty loopystatments.");
        callback();
        return;
      }
      else if (loopyStatements[0] instanceof WebAutomationLanguage.LoopStatement){
        console.log("rbb: loop.");
        var loopStatement = loopyStatements[0];
        loopStatement.relation.getNextRow(loopStatement.pageVar, function(moreRows){
          if (!moreRows){
            console.log("no more rows");
            // hey, we're done!
            callback();
            return;
          }
          console.log("we have a row!  let's run");
          // otherwise, should actually run the body
          console.log("loopyStatements", loopyStatements);
          runBasicBlock(loopStatement.bodyStatements, function(){
            // and once we've run the body, we should do the next iteration of the loop
            runBasicBlock(loopyStatements, callback); // running extra iterations of the for loop is the only time we change the callback
          });
        });
      }
      else {
        console.log("rbb: r+r.");
        // the fun stuff!  we get to run a basic block with the r+r layer
        var basicBlockStatements = [];
        var nextBlockStartIndex = loopyStatements.length;
        for (var i = 0; i < loopyStatements.length; i++){
          if (loopyStatements[i] instanceof WebAutomationLanguage.LoopStatement){
            nextBlockStartIndex = i;
            break;
          }
          basicBlockStatements.push(loopyStatements[i]);
        }

        if (nextBlockStartIndex === 0){
          console.log("nextBlockStartIndex was 0!  this shouldn't happen!", loopyStatements);
          throw("nextBlockStartIndex 0");
        }

        // make the trace we'll replay
        var trace = [];
        // label each trace item with the basicBlock statement being used
        for (var i = 0; i < basicBlockStatements.length; i++){
          var cleanTrace = basicBlockStatements[i].cleanTrace;
          _.each(cleanTrace, function(ev){EventM.setTemporaryStatementIdentifier(ev, i);});
          trace = trace.concat(cleanTrace);
        }

        // now that we have the trace, let's figure out how to parameterize it
        // note that this should only be run once the current___ variables in the statements have been updated!  otherwise won't know what needs to be parameterized, will assume nothing
        // should see in future whether this is a reasonable way to do it
        console.log("trace", trace);
        var parameterizedTrace = pbv(trace, basicBlockStatements);
        // now that we've run parameterization-by-value, have a function, let's put in the arguments we need for the current run
        console.log("parameterizedTrace", parameterizedTrace);
        var runnableTrace = passArguments(parameterizedTrace, basicBlockStatements);
        var config = parameterizedTrace.getConfig();

        // the above works because we've already put in VariableUses for statement arguments that use relation items, for all statements within a loop, so currNode for those statements will be a variableuse that uses the relation
        // however, because we're only running these basic blocks, any uses of relation items (in invisible events) that happen before the for loop will not get parameterized, 
        // since their statement arguments won't be changed, and they won't be part of the trace that does have statement arguments changed (and thus get the whole trace parameterized for that)
        // I don't see right now how this could cause issues, but it's worth thinking about

        SimpleRecord.replay(runnableTrace, config, function(replayObject){
          // use what we've observed in the replay to update page variables
          console.log("replayObject", replayObject);

          // based on the replay object, we need to update any pagevars involved in the trace;
          var trace = [];
          _.each(basicBlockStatements, function(statement){trace = trace.concat(statement.trace);}); // want the trace with display data, not the clean trace
          updatePageVars(trace, replayObject.record.events);

          // statements may need to do something based on this trace, so go ahead and do any extra processing
          for (var i = 0; i < basicBlockStatements.length; i++){
            console.log("calling postReplayProcessing on", basicBlockStatements[i]);
            basicBlockStatements[i].postReplayProcessing(replayObject.record.events, i);
          }

          // once we're done replaying, have to replay the remainder of the script
          runBasicBlock(loopyStatements.slice(nextBlockStartIndex, loopyStatements.length), callback);
        });
      }
    }

    this.run = function(){
      _.each(this.relations, function(relation){relation.clearRunningState();});
      runBasicBlock(this.loopyStatements, function(){console.log("Done with script execution.");});
    };

    function paramName(statementIndex, paramType){ // assumes we can't have more than one of a single paramtype from a single statement.  should be true
      return "s"+statementIndex+"_"+paramType;
    }

    function pbv(trace, statements){
      var pTrace = new ParameterizedTrace(trace);

      for (var i = 0; i < statements.length; i++){
        var statement = statements[i];
        var pbvs = statement.pbvs();
        console.log("pbvs", pbvs);
        for (var j = 0; j < pbvs.length; j++){
          var currPbv = pbvs[j];
          var pname = paramName(i, currPbv.type);
          if (currPbv.type === "url"){
            pTrace.parameterizeUrl(pname, currPbv.value);
          }
          else if (currPbv.type === "node"){
            pTrace.parameterizeXpath(pname, currPbv.value);
          }
          else if (currPbv.type === "typedString"){
            pTrace.parameterizeTypedString(pname, currPbv.value);
          }
          else if (currPbv.type === "tab"){
            pTrace.parameterizeTab(pname, currPbv.value);
          }
          else if (currPbv.type === "frame"){
            pTrace.parameterizeFrame(pname, currPbv.value);
          }
          else{
            console.log("Tried to do pbv on a type we don't know.");
          }
        }
      }
      return pTrace;
    }

    function passArguments(pTrace, statements){
      for (var i = 0; i < statements.length; i++){
        var statement = statements[i];
        var args = statement.args();
        for (var j = 0; j < args.length; j++){
          var currArg = args[j];
          var pname = paramName(i, currArg.type);
          if (currArg.type === "url"){
            pTrace.useUrl(pname, currArg.value);
          }
          else if (currArg.type === "node"){
            pTrace.useXpath(pname, currArg.value);
          }
          else if (currArg.type === "typedString"){
            pTrace.useTypedString(pname, currArg.value);
          }
          else if (currArg.type === "tab"){
            pTrace.useTab(pname, currArg.value);
          }
          else if (currArg.type === "frame"){
            pTrace.useFrame(pname, currArg.value);
          }
          else{
            console.log("Tried to do pbv on a type we don't know. (Arg provision.)");
          }
        }
      }
      return pTrace.getStandardTrace();
    }

    function longestCommonPrefix(strings) {
      if (strings.length < 1) {
        return "";
      }
      if (strings.length == 1){
        return strings[0];
      }

      var sorted = strings.slice(0).sort(); // copy
      var string1 = sorted[0];
      var string2 = sorted[sorted.length - 1];
      var i = 0;
      var l = Math.min(string1.length, string2.length);

      while (i < l && string1[i] === string2[i]) {
        i++;
      }

      return string1.slice(0, i);
    }

    var pagesToNodes = {};
    var pagesProcessed = {};
    this.relevantRelations = function(){
      // ok, at this point we know the urls we've used and the xpaths we've used on them
      // we should ask the server for relations that might help us out
      // when the server gets back to us, we should try those relations on the current page
      // we'll compare those against the best we can create on the page right now, pick the winner

      // get the xpaths used on the urls
      for (var i = 0; i < this.statements.length; i++){
        var s = this.statements[i];
        if ( (s instanceof WebAutomationLanguage.ScrapeStatement) || (s instanceof WebAutomationLanguage.ClickStatement) ){
          var xpath = s.node; // todo: in future, should get the whole node info, not just the xpath, but this is sufficient for now
          var url = s.pageUrl; // the top url of the frame on which the relevant events were raised
          if (!(url in pagesToNodes)){ pagesToNodes[url] = []; }
          console.log(pagesToNodes[url], xpath, xpath in pagesToNodes[url]);
          if (pagesToNodes[url].indexOf(xpath) === -1){ pagesToNodes[url].push(xpath); }
        }
      }
      // ask the server for relations
      // sample: $($.post('http://localhost:3000/retrieverelations', { pages: [{xpaths: ["a[1]/div[2]"], url: "www.test2.com/test-test"}] }, function(resp){ console.log(resp);} ));
      var reqList = [];
      for (var url in pagesToNodes){
        reqList.push({url: url, xpaths: pagesToNodes[url]});

      }
      var that = this;
      $.post('http://visual-pbd-scraping-server.herokuapp.com/retrieverelations', { pages: reqList }, function(resp){that.processServerRelations(resp);});
    }

    this.processServerRelations = function(resp){
      // we're ready to try these relations on the current pages
      console.log(resp); 
      var resps = resp.pages;
      for (var i = 0; i < resps.length; i++){
        var url = resps[i].url;
        var suggestedRelations = [resps[i].relations.same_domain_best_relation, resps[i].relations.same_url_best_relation];
        for (var j = 0; j < suggestedRelations.length; j++){
          if (suggestedRelations[j] === null){ continue; }
          ServerTranslationUtilities.unJSONifyRelation(suggestedRelations[j]); // is this the best place to deal with going between our object attributes and the server strings?
        }
        (function(){
          var curl = url; // closure copy
          var csuggestedRelations = suggestedRelations;
          chrome.tabs.create({url: curl, active: false}, function(tab){
            console.log(tab.id);
            pagesProcessed[curl] = false;
            var getLikelyRelationFunc = function(){utilities.sendMessage("mainpanel", "content", "likelyRelation", {xpaths: pagesToNodes[curl], url:curl, serverSuggestedRelations: csuggestedRelations}, null, null, [tab.id]);};
            var getLikelyRelationFuncUntilAnswer = function(){
              console.log(pagesProcessed);
              if (pagesProcessed[curl]){ return; } 
              getLikelyRelationFunc(); 
              setTimeout(getLikelyRelationFuncUntilAnswer, 1000);}
            setTimeout(getLikelyRelationFuncUntilAnswer, 500); // give it a while to attach the listener
          });
        }());
      }
    };

    var pagesToRelations = {};
    this.processLikelyRelation = function(data){
      console.log(data);
      chrome.tabs.remove(data.tab_id); // no longer need the tab from which we got this info
      pagesProcessed[data.url] = true;

      var rel = new WebAutomationLanguage.Relation(data.relation_id, data.name, data.selector, data.selector_version, data.exclude_first, data.columns, data.first_page_relation, data.num_rows_in_demonstration, data.url);
      pagesToRelations[data.url] = rel;
      this.relations.push(rel);

      if (_.difference(_.keys(pagesToNodes), _.keys(pagesToRelations)).length === 0) { // pagesToRelations now has all the pages from pagesToNodes
        // awesome, all the pages have gotten back to us
        setTimeout(this.insertLoops.bind(this), 0); // bind this to this, since JS runs settimeout func with this pointing to global obj
      }

      // give the text relations back to the UI-handling component so we can display to user
      return this.relations;
    };

    this.insertLoops = function(){
      var indexesToRelations = {}; // indexes into the statements mapped to the relations used by those statements
      for (var i = 0; i < this.relations.length; i++){
        var relation = this.relations[i];
        for (var j = 0; j < this.statements.length; j++){
          var statement = this.statements[j];
          if (relation.usedByStatement(statement)){
            indexesToRelations[j] = relation;
            break;
          }
        }
      }

      this.loopyStatements = this.statements;
      var indexes = _.keys(indexesToRelations).sort(function(a, b){return b-a}); // start at end, work towards beginning
      for (var i = 0; i < indexes.length; i++){
        var index = indexes[i];
        // let's grab all the statements from the loop's start index to the end, put those in the loop body
        var bodyStatementLs = this.loopyStatements.slice(index, this.loopyStatements.length);
        // we want to parameterize the body for the relation
        var relation = indexesToRelations[index];
        for (var j = 0; j < bodyStatementLs.length; j++){
          bodyStatementLs[j].parameterizeForRelation(relation);
        }
        var loopStatement = new WebAutomationLanguage.LoopStatement(relation, bodyStatementLs, this.loopyStatements[index].pageVar);
        this.loopyStatements = this.loopyStatements.slice(0, index);
        this.loopyStatements.push(loopStatement);
      }

      RecorderUI.updateDisplayedScript();
    };

  }

  return pub;
}());
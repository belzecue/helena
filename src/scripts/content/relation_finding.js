/**********************************************************************
 * Author: S. Chasins
 **********************************************************************/

var RelationFinder = (function() { var pub = {};

  /**********************************************************************
   * Web-specific relation-finder code -- how to get features, how to tell when features match, how to combine features to get a more general feature, all candidates
   **********************************************************************/

  /* Available features:
   * tag
   * class
   * left, bottom, right, top
   * font-size, font-family, font-style, font-weight, color
   * background-color
   * xpath
   * Additional processing:
   * excludeFirst
   */

   var all_features = ["tag", "class", 
   "left", "bottom", "right", "top", "width", "height",
   "font-size", "font-family", "font-style", "font-weight", "color",
   "background-color", 
   "preceding-text", "text",
   "xpath"];

    var almost_all_features = _.without(all_features, "xpath");

   function getFeature(element, feature){
    if (feature === "xpath"){
      return XPathList.xPathToXPathList(nodeToXPath(element));
    }
    else if (feature === "preceding-text"){
      return $(element).prev().text();
    }
    else if (feature === "text"){
      return $(element).text();
    }
    else if (_.contains(["tag","class"],feature)){
      return element[feature+"Name"];
    }
    else if (_.contains(["top", "right", "bottom", "left", "width", "height"], feature)){
      var rect = element.getBoundingClientRect();
      return rect[feature];
    }
    else{
      var style = window.getComputedStyle(element, null);
      return style.getPropertyValue(feature);
    }
  }

  function featureMatch(feature, value, acceptable_values){
    if (feature === "xpath"){
      return _.reduce(acceptable_values, function(acc, av){ return (acc || (XPathList.xPathMatch(av, value))); }, false);
    }
    else if (feature === "class"){
      //class doesn't have to be same, just has to include the target class
      //TODO: Decide if that's really how we want it
      return _.reduce(acceptable_values, function(acc, av){ return (acc || (value.indexOf(av) > -1)); }, false);
    }
    else {
      return _.contains(acceptable_values,value);
    }
  }

  function collapseValues(feature, values){
    if (feature === "xpath"){
      return XPathList.xPathReduction(values);
    }
    return _.uniq(values);
  }

  function makeSubcomponentFunction(suffixes){
    var subcomponentFunction = function(candidateRow){
      var candidate_subitems = [];
      var candidate_xpath = XPathList.xPathToXPathList(nodeToXPath(candidateRow));
      var null_subitems = 0;
      for (var j = 0; j < suffixes.length; j++){
        var xpath = candidate_xpath.concat(suffixes[j]);
        var xpath_string = XPathList.xPathToString(xpath);
        var nodes = xPathToNodes(xpath_string);
        if (nodes.length > 0){
          candidate_subitems.push(nodes[0]);
        }
        else{
          null_subitems += 1;
          candidate_subitems.push(null);
        }
      }
      if (candidate_subitems.length > 0 && candidate_subitems.length > null_subitems){
        return candidate_subitems;
      }
      return null;
    };
    return subcomponentFunction;
  }

  function getAllCandidates(){
    return document.getElementsByTagName("*");
  }

  /**********************************************************************
   * Domain-independent function to go from a selector to a relation of elements
   **********************************************************************/

  // given a selector, what elements from the domain match the selector?
  // feature_dict is the primary part of our selector
  // exclude_first tells us whether to skip the first row, as we often do when we have headers
  // suffixes tell us how to find subcomponents of a row in the relation
  pub.interpretRelationSelectorHelper = function(feature_dict, exclude_first, subcomponents_function){
    // console.log("interpretRelationSelectorHelper", feature_dict, exclude_first, subcomponents_function);
    var candidates = getAllCandidates();
    var list = [];
    for (i=0;i<candidates.length;i++){
      var candidate = candidates[i];
      var candidate_ok = true;
      for (var feature in feature_dict){
        var value = getFeature(candidate,feature);
        var acceptable_values = feature_dict[feature].values;
        var pos = feature_dict[feature].pos;
        var candidate_feature_match = featureMatch(feature, value, acceptable_values);
        if ((pos && !candidate_feature_match) || (!pos && candidate_feature_match)){
          candidate_ok = false;
          break;
        }
      }
      if (candidate_ok){
        candidate_subitems = subcomponents_function(candidate);
        if (candidate_subitems !== null){
          list.push(candidate_subitems);
        }
      }
    }
    if (exclude_first > 0 && list.length > exclude_first){
      return list.slice(exclude_first,list.length);
    }
    console.log(list);
    return list;
  };

  pub.interpretRelationSelector = function(selector){
    var suffixes = _.pluck(selector.columns, "suffix");
    console.log("interpretRelationSelector", selector);
    return pub.interpretRelationSelectorHelper(selector.selector, selector.exclude_first, makeSubcomponentFunction(suffixes));
  };

/**********************************************************************
 * How to actually synthesize the selectors used by the relation-finder above
 **********************************************************************/

  function findCommonAncestor(nodes){
    // this doesn't handle null nodes, so filter those out first
    nodes = _.filter(nodes, function(node){return node !== null;});
    var xpath_lists = _.map(nodes, function(node){ return XPathList.xPathToXPathList(nodeToXPath(node)); });
    if (xpath_lists.length === 0){
      console.log("Why are you trying to get the common ancestor of 0 nodes?");
      return;
    }
    var first_xpath_list = xpath_lists[0];
    for (var i = 0; i< first_xpath_list.length; i++){
      var all_match = _.reduce(xpath_lists, function(acc, xpath_list){return acc && _.isEqual(xpath_list[i],first_xpath_list[i]);}, true);
      if (!all_match){ break; }
    }
    var last_matching = i - 1;
    var ancestor_xpath_list = first_xpath_list.slice(0,last_matching+1);
    var ancestor_nodes = xPathToNodes(XPathList.xPathToString(ancestor_xpath_list));
    return ancestor_nodes[0];
  }

  function hasAllSubnodes(node, suffixes){
    var xpath_list = XPathList.xPathToXPathList(nodeToXPath(node));
    //check whether this node has an entry for all desired suffixes
    for (var j = 0; j < suffixes.length; j++){
      var suffix = suffixes[j];
      var suffix_xpath_string = XPathList.xPathToString(xpath_list.concat(suffix));
      var suffix_nodes = xPathToNodes(suffix_xpath_string);
      if (suffix_nodes.length === 0){
        return false;
      }
      return true;
    }
  }

  function findSiblingAtLevelIIndexJ(xpath_list, i, j, suffixes){
    xpath_list[i].index = j;
    var xpath_string = XPathList.xPathToString(xpath_list); 
    var nodes = xPathToNodes(xpath_string); // the node at index j, because we updated the index in xpath_list
    if (nodes.length > 0) { 
      // awesome.  there's actually a node at this xpath.  let's make it our candidate node
      var candidateNode = nodes[0];
      if (hasAllSubnodes(candidateNode, suffixes)){
        return candidateNode;
      }
    }
    return null;
  }

  // find a sibling of the argument node that also has all the suffixes
  function findSibling(node, suffixes){
    var xpath_list = XPathList.xPathToXPathList(nodeToXPath(node));
    var xpath_list_length = xpath_list.length;
    for (var i = (xpath_list.length - 1); i >= 0; i--){ // start at the end of the xpath, move back towards root
      var index = parseInt(xpath_list[i].index); // at this component of the xpath, what index?
      var candidateNode = findSiblingAtLevelIIndexJ(xpath_list, i, index + 1, suffixes); // try one index over
      if (candidateNode !== null) {return candidateNode;}
      if (index > 0){
        // ok, adding 1 to our index didn't work.  but we started above 0, so let's try subtracting 1
        var candidateNode = findSiblingAtLevelIIndexJ(xpath_list, i, index - 1, suffixes); // subtracting
        if (candidateNode !== null) {return candidateNode;}
      }
      xpath_list[i].index = index; // set it back to the original index since we may be using it later
    }
    return null;
  }

  function columnsFromNodeAndSubnodes(node, subnodes){
    var nodexpl = XPathList.xPathToXPathList(nodeToXPath(node));
    var nodexpllength = nodexpl.length;
    columns = [];
    for (var i = 0; i < subnodes.length; i++){
      var xpath = nodeToXPath(subnodes[i]);
      var subnodexpl = XPathList.xPathToXPathList(xpath);
      var suffix = subnodexpl.slice(nodexpllength, subnodexpl.length);
      columns.push({xpath: xpath, suffix: suffix, id: null});
    }
    return columns;
  }

  function Selector(dict, exclude_first, columns, positive_nodes, negative_nodes){
    return {selector: dict, exclude_first: exclude_first, columns: columns, positive_nodes: positive_nodes, negative_nodes: negative_nodes};
  }

  function synthesizeSelector(positive_nodes, negative_nodes, columns, features){
    if(typeof(features)==='undefined') {features = ["tag", "xpath"];}
    
    var feature_dict = featureDict(features, positive_nodes);
    if (feature_dict.hasOwnProperty("xpath") && feature_dict["xpath"].length > 3 && features !== almost_all_features){
      //xpath alone can't handle our positive nodes
      return synthesizeSelector(positive_nodes, negative_nodes, columns, almost_all_features);
    }
    //if (feature_dict.hasOwnProperty("tag") && feature_dict["tag"].length > 1 && features !== all_features){
    //  return synthesizeSelector(all_features);
    //}
    var rows = pub.interpretRelationSelector(Selector(feature_dict, false, columns));
    
    //now handle negative examples
    var exclude_first = 0;
    for (var j = 0; j < rows.length; j++){
      var nodes = rows[j];
      for (var i = 0; i < nodes.length ; i++){
        var node = nodes[i];
        if (_.contains(negative_nodes, node)){
          if (j === 0){
            exclude_first = 1;
          }
          else if (features !== almost_all_features) {
            //xpaths weren't enough to exclude nodes we need to exclude
            console.log("need to try more features.");
            return synthesizeSelector(positive_nodes, negative_nodes, columns, almost_all_features);
          }
          else {
            console.log("using all our features and still not working.  freak out.");
            console.log(feature_dict);
            //we're using all our features, and still haven't excluded
            //the ones we want to exclude.  what do we do?  TODO
          }
        }
      }
    }
    return Selector(feature_dict, exclude_first, columns, positive_nodes, negative_nodes);
  }

  function featureDict(features, positive_nodes){
    //initialize empty feature dict
    var feature_dict = {};
    for (var i = 0; i < features.length; i++){
      feature_dict[features[i]] = {"values":[],"pos":true};
    }
    //add all positive nodes' values into the feature dict
    for (var i = 0; i < positive_nodes.length; i++){
      var node = positive_nodes[i];
      for (var j = 0; j < features.length; j++){
        var feature = features[j];
        var value = getFeature(node,feature);
        feature_dict[feature]["values"].push(value);
      }
    }

    console.log("featureDict feature_dict", feature_dict);
    
    //where a feature has more then 3 values, it's too much
    //also need to handle xpath differently, merging to xpaths with *s
    var filtered_feature_dict = {};
    for (var feature in feature_dict){
      var values = collapseValues(feature, feature_dict[feature]["values"]);
      console.log(feature, values.length, positive_nodes.length);
      if (feature === "xpath" || (values.length <= 3 && values.length !== positive_nodes.length)){
        console.log("accept feature: ", feature);
        filtered_feature_dict[feature] = {"values":values,"pos":true};
      }
    }

    console.log("returning featureDict filtered_feature_dict", filtered_feature_dict);
    return filtered_feature_dict;
  }

  pub.synthesizeFromSingleRow = function(rowNodes){
    var ancestor = findCommonAncestor(rowNodes);
    var positive_nodes = [ancestor];
    var columns = columnsFromNodeAndSubnodes(ancestor, rowNodes);
    var suffixes = _.pluck(columns, "suffix");
    var likeliest_sibling = findSibling(ancestor, suffixes);
    if (likeliest_sibling !== null){
      positive_nodes.push(likeliest_sibling);
    }
    return synthesizeSelector(positive_nodes, [], columns);
  }

  function combinations(arr) {
      var ps = [[]];
      for (var i=0; i < arr.length; i++) {
          for (var j = 0, len = ps.length; j < len; j++) {
              ps.push(ps[j].concat(arr[i]));
          }
      }
      return ps;
  }

  function synthesizeSelectorForSubsetThatProducesLargestRelation(rowNodes){
    var combos = combinations(rowNodes);
    var maxNumCells = -1;
    var maxSelector = null;
    for (var i = 0; i < combos.length; i++){
      var combo = combos[i];
      if (combo.length < 1){ continue; }
      var selector = pub.synthesizeFromSingleRow(combo);
      console.log("selector", selector);
      var relation = pub.interpretRelationSelector(selector);
      var numCells = combo.length * relation.length;
      if (numCells > maxNumCells){
        maxNumCells = numCells;
        maxSelector = selector;
        console.log("maxselector", maxSelector);
        console.log("relation", relation);
      }
    }
    selector.relation = relation;
    return selector;
  }

  function numMatchedXpaths(targetXpaths, firstRow){
    var firstRowXpaths = _.pluck(firstRow, "xpath");
    var matchedXpaths = _.intersection([targetXpaths, firstRowXpaths]);
    return matchedXpaths.length;
  }

  function recordComparisonAttributesNewSelector(selectorData, targetXpaths){
    var rel = selectorData.relation;
    selectorData.numMatchedXpaths = numMatchedXpaths(targetXpaths, rel[0]);
    selectorData.numRows = rel.length;
    selectorData.numRowsInDemo = selectorData.numRows;
    selectorData.numColumns = rel[0].length;
  }

  function recordComparisonAttributesServerSelector(selectorData, targetXpaths){
    var rel = selectorData.relation;
    selectorData.numMatchedXpaths = numMatchedXpaths(targetXpaths, rel[0]);
    selectorData.numRows = rel.length;
    selectorData.numRowsInDemo = selectorData.num_rows_in_demonstration;
    selectorData.numColumns = rel[0].length;
  }

  function bestSelector(defaultRel, alternativeRel){
    if (defaultRel.numMatchedXpaths > alternativeRel.numMatchedXpaths){
      return defaultRel;
    }
    else if (defaultRel.numMatchedXpaths === alternativeRel.numMatchedXpaths){
      if (defaultRel.numRows > alternativeRel.numRows){
        return defaultRel;
      }
      else if (defaultRel.numRows === alternativeRel.numRows){
        if (defaultRel.numRowsInDemo > alternativeRel.numRowsInDemo){
          return defaultRel;
        }
        else if (defaultRel.numRowsInDemo === alternativeRel.numRowsInDemo){
          if (defaultRel.numColumns > alternativeRel.numColumns){
            return defaultRel;
          }
          else if (defaultRel.numColumns === alternativeRel.numColumns){
            // they're the same, so just return the default one
            return defaultRel;
          }
        }
      }
    }
    return alternativeRel;
  }

  pub.likelyRelation = function(msg){
    var nodes = [];
    var xpaths = msg.xpaths;
    for (var i = 0; i < xpaths.length; i++){
      nodes.push(xPathToNodes(xpaths[i])[0]);
    }
    var selectorData = synthesizeSelectorForSubsetThatProducesLargestRelation(nodes);
    var relationData = _.map(selectorData.relation, function(row){return _.map(row, function(cell){return NodeRep.nodeToMainpanelNodeRepresentation(cell);});});
    selectorData.relation = relationData;

    // this (above) is the candidate we auto-generate from the page, but want to compare to the relations the server suggested
    // criteria (1) largest number of target xpaths in the first row, (2) largest number of rows retrieved from the page, (3), largest num of rows in original demonstration (4) largest number of columns associated with relation

    var bestSelectorIsNew = true;
    var currBestSelector = selectorData;
    recordComparisonAttributesNewSelector(selectorData, xpaths);

    var serverSuggestedRelations = msg.serverSuggestedRelations;
    for (var i = 0; i < serverSuggestedRelations.length; i++){
      var rel = serverSuggestedRelations[i];
      if (rel === null){
        continue;
      }
      var selector_obj = Selector(rel.selector, rel.exclude_first, rel.columns);
      var relationNodes = pub.interpretRelationSelector(selector_obj, rel.selector_version);
      var relationData = _.map(relationNodes, function(row){return _.map(row, function(cell){return NodeRep.nodeToMainpanelNodeRepresentation(cell);});});
      rel.relation = relationData; 
      recordComparisonAttributesServerSelector(rel, xpaths);

      // use the server-provided rel as our default, since that'll make the server-side processing when we save the relation easier, and also gives us the nice names
      var newBestSelector = bestSelector(rel, currBestSelector);
      if (newBestSelector !== currBestSelector){
        currBestSelector = newBestSelector;
        bestSelectorIsNew = false;
      }
    }

    newMsg = {url: msg.url}; // this url is used by the mainpanel to keep track of which pages have been handled already
    if (bestSelectorIsNew) {
      newMsg.relation_id = null;
      newMsg.name = null;
    }
    else {
      newMsg.relation_id = currBestSelector.id;
      newMsg.name = currBestSelector.name;
    }
    console.log(currBestSelector);
    newMsg.exclude_first = currBestSelector.exclude_first;
    newMsg.num_rows_in_demonstration = currBestSelector.relation.length;
    newMsg.selector = currBestSelector.selector;
    newMsg.selector_version = 1; // right now they're all 1
    newMsg.columns = currBestSelector.columns;
    newMsg.first_page_relation = currBestSelector.relation;

    utilities.sendMessage("content", "mainpanel", "likelyRelation", newMsg);
  }

  pub.getRelationItems = function(msg){
    var relation = pub.interpretRelationSelector(msg);
    var relationData = _.map(relation, function(row){return _.map(row, function(cell){return NodeRep.nodeToMainpanelNodeRepresentation(cell);});});
    utilities.sendMessage("content", "mainpanel", "relationItems", {relation: relationData});
  };

/**********************************************************************
 * Highlight stuff
 **********************************************************************/

  var colors = ["#9EE4FF","#9EB3FF", "#BA9EFF", "#9EFFEA", "#E4FF9E", "#FFBA9E", "#FF8E61"];
  pub.highlightRelation = function(arrayOfArrays, display){
    var nodes = [];
    for (var i = 0; i < arrayOfArrays.length ; i++){
      for (var j = 0; j < arrayOfArrays[i].length; j++){
        var node = arrayOfArrays[i][j];
        if (node === null){continue;}
        // first make sure there is a color at index j, add one if there isn't
        if (j >= colors.length){
          colors.append("#000000".replace(/0/g,function(){return (~~(Math.random()*16)).toString(16);}));
        }
        var node = highlightNodeC(node, colors[j], display);
        nodes.push(node);
      }
    }
    return nodes;
  }

  var highlightCount = 0;
  var highlights = {};
  function highlightNodeC(target, color, display) {
    if (display === undefined){ display = true;}
    highlightCount +=1;
    $target = $(target);
    var offset = $target.offset();
    var boundingBox = target.getBoundingClientRect();
    var newDiv = $('<div/>');
    var idName = 'vpbd-hightlight-' + highlightCount;
    newDiv.attr('id', idName);
    newDiv.css('width', boundingBox.width);
    newDiv.css('height', boundingBox.height);
    newDiv.css('top', offset.top);
    newDiv.css('left', offset.left);
    newDiv.css('position', 'absolute');
    newDiv.css('z-index', 1000);
    newDiv.css('background-color', color);
    newDiv.css('opacity', .4);
    if (display === false){
      newDiv.css('display', 'none');
    }
    //newDiv.css('pointer-events', 'none');
    $(document.body).append(newDiv);
    var html = $target.html();
    highlights[idName] = target;
    return newDiv;
  }

  function dehighlightNode(id) {
    console.log("dehighlightNode");
    $('#' + id).remove();
  }

  function clearHighlights(){
    console.log("clearHighlights");
    for (var key in highlights){
      dehighlightNode(key);
    }
    highlights = {};
  }

/**********************************************************************
 * Everything we need for editing a relation selector
 **********************************************************************/

  var currentSelectorToEdit = null;
  pub.editRelation = function(msg){
    // utilities.sendMessage("mainpanel", "content", "editRelation", {selector: this.selector, selector_version: this.selectorVersion, exclude_first: this.excludeFirst, columns: this.columns}, null, null, [tab.id]);};
    currentSelectorToEdit = msg;
    document.addEventListener('click', editingClick, true);
    pub.setRelation(currentSelectorToEdit)
    pub.highlightSelector(currentSelectorToEdit);
    // start with the assumption that the first row should definitely be included
    msg.positive_nodes = [findCommonAncestor(currentSelectorToEdit.relation[0]),findCommonAncestor(currentSelectorToEdit.relation[1])];
    msg.negative_nodes = [];
    pub.sendSelector(currentSelectorToEdit);
  };

  pub.setRelation = function(selectorObj){
    selectorObj.relation = pub.interpretRelationSelector(selectorObj);
    selectorObj.num_rows_in_demo = selectorObj.relation.length;
  };

  pub.highlightSelector = function(selectorObj){
    highlightRelation(selectorObj.relation);
  };

  pub.sendSelector = function(selectorObj){
    var relation = selectorObj.relation;
    var relationData = _.map(relation, function(row){return _.map(row, function(cell){return NodeRep.nodeToMainpanelNodeRepresentation(cell);});}); // mainpanel rep version
    selectorObj.demonstration_time_relation = relationData;
    selectorObj.relation = null; // don't send the relation
    utilities.sendMessage("content", "mainpanel", "editRelation", selectorObj);
    selectorObj.relation = relation; // restore the relation
  };

  pub.newSelectorGuess = function(selectorObj){
    pub.setRelation(selectorObj);
    pub.highlightSelector(selectorObj);
    pub.sendSelector(selectorObj);
  }

  function editingClick(event){
    event.stopPropagation();
    event.preventDefault();

    var target = event.target;
    var removalClick = false;
    // it's only a removal click if the clicked item is a highlight
    var id = $(target).attr("id");
    if (id !== null && id !== undefined && id.indexOf("vpbd-hightlight") > -1){
      removalClick = true;
      // actual target is the one associated with the highlight
      target = highlights[id];
      var nodeToRemove = target; // recall the target itself may be the positive example, as when there's only one column
      if (currentSelectorToEdit.positive_nodes.indexOf(target) < 0){
        // ok it's not the actual node, better check the parents
        var parents = $(target).parents(); 
        for (var i = parents.length - 1; i > 0; i--){
          var parent = parents[i];
          var index = currentSelectorToEdit.positive_nodes.indexOf(parent);
          if ( index > -1){
            // ok, so this click is for removing a node.  removing the row?  removing the column?
            // not that useful to remove a column, so probably for removing a row...
            nodeToRemove = parent;
            break;
          }
        }
      }
      // actually remove the node from positive, add to negative
      var ind = currentSelectorToEdit.positive_nodes.indexOf(nodeToRemove);
      currentSelectorToEdit.positive_nodes.splice(ind, 1);
      currentSelectorToEdit.negative_nodes.push(nodeToRemove);
    }
    // we've done all our highlight stuff, know we no longer need that
    // dehighlight our old list
    clearHighlights();

    if (!removalClick){
      // ok, so we're trying to add a node.  is the node another cell in an existing row?  or another row?  could be either.
      // for now, assume it's another cell in an existing row
      // todo: give the user an interaction that allows him or her say it's actually another row
      // todo: put some kind of outline around the ones we think of the user as having actually demonstrated to us?  the ones we're actually using to generate the selector?  so that he/she knows which to actually click on to change things
      // maybe green outlines (or color-corresponding outlines) around the ones we're trying to include, red outlines around the ones we're trying to exclude.

      // let's figure out which row it should be
      // go through all rows, find common ancestor of the cells in the row + our new item, pick whichever row produces an ancestor deepest in the tree
      var currRelation = currentSelectorToEdit.relation;
      var deepestCommonAncestor = null;
      var deepestCommonAncestorDepth = 0;
      var currRelationIndex = 0;
      for (var i = 0; i < currRelation.length; i++){
        var nodes = currRelation[i];
        var ancestor = findCommonAncestor(nodes.concat([target]));
        var depth = $(ancestor).parents().length;
        if (depth > deepestCommonAncestorDepth){
          deepestCommonAncestor = ancestor;
          deepestCommonAncestorDepth = depth;
          currRelationIndex = i;
        }
      }

      var columns = columnsFromNodeAndSubnodes(deepestCommonAncestor, currRelation[currRelationIndex].concat([target]));
      currentSelectorToEdit.columns = columns;

      // let's check whether the common ancestor has actually changed.  if no, this is easy and we can just change the columns
      // if yes, it gets more complicated
      var origAncestor = findCommonAncestor(currRelation[currRelationIndex]);
      var newAncestor = findCommonAncestor(currRelation[currRelationIndex].concat([target]));
      if (origAncestor === newAncestor){
        // we've already updated the columns, so we're ready
        pub.newSelectorGuess(currentSelectorToEdit);
        return;
      }
      // drat, the ancestor has actually changed.
      // let's assume that all the items in our current positive nodes list will have *corresponding* parent nodes...  (based on difference in depth.  not really a good assumption, but we already assume that we have fixed xpaths to get to subcomponents, so we're already making that assumption)
      var xpath = nodeToXPath(newAncestor);
      var xpathlen = xpath.split("/").length;
      var xpathO = nodeToXPath(origAncestor);
      var xpathlenO = xpath.split("/").length;
      var depthDiff = xpathlenO - xpathlen;
      for (var i = 0; i < currentSelectorToEdit.positive_nodes.length; i++){
        var ixpath = nodeToXPath(currentSelectorToEdit.positive_nodes[i]);
        var components = ixpath.split("/").slice(0, components.length - depthDiff);
        var newxpath = components.join("/");
        currentSelectorToEdit.positive_nodes[i] = xPathToNodes(newxpath)[0];
      }
      if (currentSelectorToEdit.positive_nodes.indexOf(deepestCommonAncestor) === -1){
        currentSelectorToEdit.positive_nodes.push(deepestCommonAncestor);
      }
    }

    var newSelector = synthesizeSelector(currentSelectorToEdit.positive_nodes, currentSelectorToEdit.negative_nodes, currentSelectorToEdit.columns);
    currentSelectorToEdit = newSelector;
    pub.newSelectorGuess(currentSelectorToEdit);
  }

return pub;}());
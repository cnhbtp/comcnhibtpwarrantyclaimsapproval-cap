sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History",
    "sap/ui/model/Sorter",
    "com/cnhi/btp/warrantyclaimsapproval/model/ReqHelper",
    "sap/ui/core/BusyIndicator"
],
    function (BaseController, MessageBox, Filter, FilterOperator, MessageToast, History, Sorter, ReqHelper, BusyIndicator) {
        "use strict";
        var sServiceUrl;
        return BaseController.extend("com.cnhi.btp.warrantyclaimsapproval.controller.Detail", {
            
            /* =========================================================== */
            /* lifecycle methods                                           */
            /* =========================================================== */

            /**
             * Called when this controller is instantiated.
             * @public
             */
            onInit: function () {
                this._ownerComponent = this.getOwnerComponent();

                this._deviceModel  = this._ownerComponent.getDeviceModel();  

                sServiceUrl = this.getOwnerComponent().getModel("ClaimApprovalCAP").sServiceUrl;
                this.getRouter().getRoute("detail").attachPatternMatched(this._onObjectMatched, this);
            },

            /* =========================================================== */
            /* event handlers                                              */
            /* =========================================================== */

            /**
             * Event handler for Approve Button
             * @public
             */
            onPressApproveBtn: function(){
                var oLocalModel = this.getModel("LocalModel");
                MessageBox.confirm(this.getResourceBundle().getText("apprCnfmMsg"),{
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function(sAction){
                        if(sAction === 'YES'){
                            oLocalModel.setProperty("/action",'A');
                            this.onAction();
                        }
                    }.bind(this)
                });
            },
            /**
             * Event handler for Reject Button
             * @public
             */
            onPressRejectBtn: function(){
                var oLocalModel = this.getModel("LocalModel");
                    MessageBox.confirm(this.getResourceBundle().getText("rejCnfmMsg"),{
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function(sAction){
                        if(sAction === 'YES'){
                            oLocalModel.setProperty("/action",'R');
                            this.onAction();
                        }
                    }.bind(this)
                });
            },
            onPressSubmitBtn: function(){
                var oLocalModel = this.getModel("LocalModel");
                var oBindingCtx = this.getView().getBindingContext("LocalModel").getObject();
                var bFlag=false;
                oBindingCtx.NextApprovers = oBindingCtx.NextApprovers ? oBindingCtx.NextApprovers : [];
                if(oBindingCtx.NextApprovers.length === 0){
                    MessageToast.show(this.getResourceBundle().getText('warningMsg2'));
                    return;
                }
                for(var i=0; i<oBindingCtx.NextApprovers.length; i++){
                    if(!oBindingCtx.NextApprovers[i].email){
                        bFlag = true;
                        break;
                    }
                }
                if(bFlag){
                    MessageToast.show(this.getResourceBundle().getText('warningMsg1'));
                    return;
                }
                MessageBox.confirm(this.getResourceBundle().getText("submitCnfmMsg"),{
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function(sAction){
                        if(sAction === 'YES'){
                            oLocalModel.setProperty("/action",'S');
                            this.onAction();
                        }
                    }.bind(this)
                });
            },

            onTableUpdated: function(oEvent){
                var oSrc = oEvent.getSource();
                var aCol = oSrc.getColumns();
                for(var i=0; i<aCol.length; i++){
                    aCol[i].getLabel().setDesign('Bold');
                }
            },

            onAddNextApprover: function(){
                var oLocalModel = this.getModel("LocalModel");
                var sPath = this.getView().getBindingContext("LocalModel").getPath();
                var aNextApprovers = oLocalModel.getProperty(sPath+"/NextApprovers");
                aNextApprovers = aNextApprovers ? aNextApprovers : [];
                aNextApprovers.push({
                    name: "",
                    email: "",
                    level: aNextApprovers.length + 1,
                    statusCode: ""
                });
                oLocalModel.setProperty(sPath+"/NextApprovers", $.extend(true,[],aNextApprovers));
                oLocalModel.setProperty("/showProcessFlow", false);
                oLocalModel.setProperty(sPath+"/LevelItems", $.extend(true,[],aNextApprovers));
            },
            
            /* =========================================================== */
            /* internal methods                                            */
            /* =========================================================== */

            /**
             * Binds the view to the object path.
             * @function
             * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
             * @private
             */
            _onObjectMatched : async function (oEvent) {
                var that = this;
                var oArguments =  oEvent.getParameter("arguments");
                var sClaim = oArguments.claim;
                var oLocalModel = this.getModel("LocalModel");
                var aResult = oLocalModel.getProperty("/Results");
                if (aResult == undefined) {
                    try {
                        var bIsRequestor = oLocalModel.getProperty("/IsRequestorLoggedIn");
                        if(bIsRequestor){
                            await this._getWarrantyListPromise("ObjectPageLayout", sClaim);
                        } else {
                            await this._getClaimsFromCAPMPromise("ObjectPageLayout");
                        }
                    } catch (error) {
                        
                    }
                }
                var iSelIdx = oLocalModel.getProperty("/Results").findIndex(function(el){
                    return el.Clmno === sClaim;
                });
                oLocalModel.setProperty("/Comment", "");
                this.getView().setBindingContext(oLocalModel.createBindingContext("/Results/"+iSelIdx), "LocalModel");
                var oBindingCtx = this.getView().getBindingContext("LocalModel").getObject();
                var sGUID = oBindingCtx.id;
                this._getComments();
                
                if(oBindingCtx.IsRequestor){
                    this._getApprovalSequence();

                    Promise.allSettled([this._getDefectsList(),this._getDefectsVersionList()])
                        .then(values => {
                            var sBindingCtxPath = that.getView().getBindingContext('LocalModel').getPath();
                            var oBindingCtx = that.getView().getBindingContext('LocalModel').getObject();
                            var oActualData = JSON.parse(oBindingCtx.ActualData)
                            if  (values[0] && values[0].status === 'fulfilled') {
                                oActualData['DefectList'] = values[0].value;
                            }
                            if  (values[1] && values[1].status === 'fulfilled') {
                                oActualData['DefectVersionList'] =  values[1].value;
                            }
                            oLocalModel.setProperty(sBindingCtxPath+"/ActualData", JSON.stringify(oActualData));
                        })

                    oLocalModel.setProperty("/showProcessFlow", true);
                }
                if(oBindingCtx.CAPMStatusCode && oBindingCtx.CAPMStatusCode === 'A'){
                    this._getActions();
                }

                this._getAttachments();
                this._clearFileUploader();
                var oFileUploader = this.getView().byId("__fileUploader");
                var aServiceUrl = this.getOwnerComponent().getModel().sServiceUrl;
                oFileUploader.setUploadUrl(aServiceUrl + '/AttachmentStreamSet');
            },
            _getDefectsList: function(){
                var that = this;
                return new Promise((resolve,reject) => {
                    
                    var oDataModel = that.getModel();
                    var oLocalModel = this.getModel("LocalModel");
                    var sBindingCtxPath = that.getView().getBindingContext('LocalModel').getPath();
                    var oBindingCtx = that.getView().getBindingContext('LocalModel').getObject();
                    //var oActualData = JSON.parse(oBindingCtx.ActualData);
                    var sUrl = oDataModel.sServiceUrl + "/DefectSet";
                    oLocalModel.setProperty(sBindingCtxPath+"/DefectList", []);
                    that.loadBusyIndicator("ObjectPageLayout",true);
                    $.ajax({
                        url: sUrl,
                        dataType: 'JSON',
                        type: "get",
                        data: { 
                            search: oBindingCtx.Clmno,
                            $expand: 'DefectExposed'
                        },
                        success: function(oData) {
                            that.loadBusyIndicator("ObjectPageLayout",false);
                            if(oData.d && oData.d.results && oData.d.results.length > 0){
                                //oActualData['DefectList'] = oData.d.results;
                                //oLocalModel.setProperty(sBindingCtxPath+"/ActualData", JSON.stringify(oActualData));
                                oLocalModel.setProperty(sBindingCtxPath+"/DefectList", oData.d.results);
                                resolve(oData.d.results);
                            }
                            resolve([]);
                        },
                        error: function(oError) {
                            that.loadBusyIndicator("ObjectPageLayout",false);
                            if(oError && oError.responseText && JSON.parse(oError.responseText)){
                                MessageBox.error(JSON.parse(oError.responseText).error.message.value);
                            }
                            reject(oError);
                        }
                      });
                });

            },
            _getDefectsVersionList: function(){
                var that = this;
                return new Promise((resolve,reject) => {
                    
                    var oDataModel = that.getModel();
                    var oLocalModel = this.getModel("LocalModel");
                    var sBindingCtxPath = that.getView().getBindingContext('LocalModel').getPath();
                    var oBindingCtx = that.getView().getBindingContext('LocalModel').getObject();
                    //var oActualData = JSON.parse(oBindingCtx.ActualData);
                    var sUrl = oDataModel.sServiceUrl + "/DefectVersionSet";
                    oLocalModel.setProperty(sBindingCtxPath+"/DefectVersionList", []);
                    that.loadBusyIndicator("ObjectPageLayout",true);
                    $.ajax({
                        url: sUrl,
                        dataType: 'JSON',
                        type: "get",
                        data: { 
                            search: oBindingCtx.Clmno,
                            $expand: 'DefectExposed'
                        },
                        success: function(oData) {
                            that.loadBusyIndicator("ObjectPageLayout",false);
                            if(oData.d && oData.d.results && oData.d.results.length > 0){
                                //oActualData['DefectVersionList'] = oData.d.results;
                                //oLocalModel.setProperty(sBindingCtxPath+"/ActualData", JSON.stringify(oActualData));
                                oLocalModel.setProperty(sBindingCtxPath+"/DefectVersionList", oData.d.results);
                                resolve(oData.d.results);
                            }
                            resolve([]);
                        },
                        error: function(oError) {
                            that.loadBusyIndicator("ObjectPageLayout",false);
                            if(oError && oError.responseText && JSON.parse(oError.responseText)){
                                MessageBox.error(JSON.parse(oError.responseText).error.message.value);
                            }
                            reject(oError);
                        }
                    });
                });
            },
            _clearFileUploader: function() {
                var oFileUploader = this.getView().byId("__fileUploader");
                oFileUploader.clear();
            },

            _getAttachments: function() {
                var oView = this.getView()
                var oBindingCtx = oView.getBindingContext('LocalModel').getObject();
                var aFilter = [];
                aFilter.push(new Filter({
                    path: "Clmno",
                    operator: FilterOperator.EQ,
                    value1: oBindingCtx.Clmno,
                    value2: undefined
                }));
                var oListAttachments = oView.byId('idListAttachments');
                var oListItemBinding = oListAttachments.getBinding("items");
                oListItemBinding.filter(aFilter);
                oListAttachments.updateAggregation('items',sap.ui.model.ChangeReason.Refresh);
                oListAttachments.getModel().updateBindings(true);
                oListAttachments.getModel().refresh(true);
            },
            onAttachmentDownload: function(oEvent) {
                var sSrc = oEvent.getSource().data('downall');
                var oDataModel = this.getModel();
                var sServiceUrl = oDataModel.sServiceUrl;
                if ( sSrc === 'All' ) {
                    var oBindingCtx = this.getView().getBindingContext('LocalModel').getObject();
                    window.open(`${sServiceUrl}/AttachmentStreamSet(Clmno='${oBindingCtx.Clmno}',FileName='')/$value`,"_blank");
                } else {
                    var oDataModel = this.getModel();
                    var sServiceUrl = oDataModel.sServiceUrl;
                    var oSource = oEvent.getSource();
                    var oSrcBindingCtx = oSource.getBindingContext();
                    var oSrcModelItem = oSrcBindingCtx.getObject();
                    window.open(`${sServiceUrl}/AttachmentStreamSet(Clmno='${oSrcModelItem.Clmno}',FileName='${ oSrcModelItem.FileName }')/$value`,"_blank");
                }
            },
            onAttachmentDelete: function(oEvent) {
                var that = this;
                var oDataModel = this.getModel();
                var sServiceUrl = oDataModel.sServiceUrl;
                var oSource = oEvent.getSource();
                var oSrcBindingCtx = oSource.getBindingContext();
                var oSrcModelItem = oSrcBindingCtx.getObject();
                MessageBox.confirm(this.getResourceBundle().getText("Detail_TBL_Attachment_MSG_Confirm_Delete"), {
                    onClose: function(oAction) {
                        if (oAction === MessageBox.Action.OK) { 
                            var path = `/AttachmentSet(Clmno='${oSrcModelItem.Clmno}',FileName='${ oSrcModelItem.FileName }')`;
                            oDataModel.remove(path, {
                                success: function (data, response) {
                                    MessageBox.success(that.getResourceBundle().getText("Detail_TBL_Attachment_MSG_Confirm_Success"));
                                    that.getView().getModel().refresh(true);
                                },
                                error: function (error) {
                                    MessageBox.error(that.getResourceBundle().getText("Detail_TBL_Attachment_MSG_Confirm_Error"));
                                    that.getView().getModel().refresh(true);
                                }
                            });
                        }
                    }
                });
            },
            onChangeEmail: function(){
                var oLocalModel = this.getModel("LocalModel");
                oLocalModel.setProperty("/showProcessFlow", false);
            },
            _getActions: function(){
                var that = this;
                var oLocalModel = that.getModel('LocalModel');
                var oDataModel = that.getModel();
                var oBindingCtx = that.getView().getBindingContext('LocalModel').getObject();
                var sUrl = oDataModel.sServiceUrl + "/ActionsSet";
                oLocalModel.setProperty("/Actions",[]);
                that.loadBusyIndicator("idDefectTbl",true);
                $.ajax({
                    url: sUrl,
                    dataType: 'JSON',
                    type: "get",
                    data: { 
                        search: oBindingCtx.Clmno
                    },
                    success: function(oData) {
                        that.loadBusyIndicator("idDefectTbl",false);
                        if(oData.d && oData.d.results && oData.d.results.length > 0){
                            oLocalModel.setProperty("/Actions", oData.d.results);
                        }
                    },
                    error: function(oError) {
                        that.loadBusyIndicator("idDefectTbl",false);
                        if(oError && oError.responseText && JSON.parse(oError.responseText)){
                            MessageBox.error(JSON.parse(oError.responseText).error.message.value);
                        }
                    }
                  });
            },
            _getApprovalSequence: function(){
                var oLocalModel = this.getModel("LocalModel");
                var iCurrLevel = this.getView().getBindingContext("LocalModel").getObject().currentLevel;
                var aNextAprrovers = this.getView().getBindingContext("LocalModel").getObject().NextApprovers;
                for(var i=0; i<aNextAprrovers.length; i++){
                    aNextAprrovers[i]['icon'] = aNextAprrovers[i]['statusCode'] === 'A' ? 'sap-icon://employee-approvals' : aNextAprrovers[i]['statusCode'] === 'R' ? 'sap-icon://employee-rejections' : 'sap-icon://employee';
                    aNextAprrovers[i]['id'] = i.toString();
                    aNextAprrovers[i]['position'] = i;
                    aNextAprrovers[i]['state'] = aNextAprrovers[i]['statusCode'] === 'A' ? [{
                        "state": "Positive",
                        "value": 10
                    }] : aNextAprrovers[i]['statusCode'] === 'R' ? [{
                        "state": "Negative",
                        "value": 10
                    }] : [{
                        "state": "Neutral",
                        "value": 10
                    }];
                }

                // for(var i=1; i<=aNextAprrovers.length; i++){
                //     aNextAprrovers[i-1]['icon'] = (i < iCurrLevel || iCurrLevel === null) ? 'sap-icon://employee-approvals' : 'sap-icon://employee';
                //     aNextAprrovers[i-1]['id'] = (aNextAprrovers[i-1]['level'] - 1).toString();
                //     aNextAprrovers[i-1]['position'] = aNextAprrovers[i-1]['level'] - 1;
                //     aNextAprrovers[i-1]['state'] = (i < iCurrLevel || iCurrLevel === null) ? [{
                //         "state": "Positive",
                //         "value": 10
                //     }] : [{
                //         "state": "Neutral",
                //         "value": 10
                //     }];
                // }
                oLocalModel.setProperty(this.getView().getBindingContext("LocalModel").getPath()+"/NextApprovers", $.extend(true,[],aNextAprrovers));
            },
            _getComments: function(){
                var that = this;
                var oLocalModel = this.getModel("LocalModel");
                var sBindingCtxPath = that.getView().getBindingContext('LocalModel').getPath();
                var oBindingCtx = that.getView().getBindingContext('LocalModel').getObject();
                var sUrl = sServiceUrl + "CommentSet";
                this.loadBusyIndicator("ObjectPageLayout", true);
                oLocalModel.setProperty(sBindingCtxPath+"/Comments", []);
                ReqHelper.sendGetReq(sUrl).then(function (oRes) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    if(oRes.value.length > 0){
                        oLocalModel.setProperty(sBindingCtxPath+"/Comments", oRes.value.filter(function(el){
                            return el.claimNo === oBindingCtx.Clmno;
                        }));
                    }
                }.bind(this))
                .catch(function (response) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that.handleCAPMErrors(response);
                }.bind(this));
            },
            onUpdateBackend: function(){
                var that = this;
                var oLocalModel = that.getModel("LocalModel");
                var oDataModel = that.getModel();
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                var sSelProcess = oBindingCtx.selProcess;
                if(!sSelProcess){
                    MessageToast.show(this.getResourceBundle().getText('warMsg3'));
                    return;
                }
                var sPath = oDataModel.createKey("/WarrantySet",{
                    Clmno: oBindingCtx.Clmno
                });
                var oPayload = {
                    Astate: sSelProcess
                };
                BusyIndicator.show();
                oDataModel.update(sPath,oPayload,{
                    success: function(oData, oRes){
                        BusyIndicator.hide();
                        that._onCloseClaim();
                    }
                });
            },
            onAction: function(){
                var that = this;
                var oLocalModel = that.getModel("LocalModel");
                var sAction = oLocalModel.getProperty("/action");
                if(sAction === 'A'){
                    this._onApproveToCAPM();
                } else if(sAction === 'S'){
                    this._onSubmitToCAPM();
                } else if(sAction === 'R'){
                    this._onRejectToCAPM();
                }
            },
            onChangeNextApprSeq: function(oEvent){
                var sSrc = oEvent.getSource().data('move');
                var oTable = this.getControl('idNextApproverTbl');
                var aSelRow = oTable.getSelectedContexts();
                var oBindingCtx = this.getView().getBindingContext("LocalModel");
                var sPath = oBindingCtx.getPath();
                var oLocalModel = this.getModel("LocalModel");
                var aSeq = oLocalModel.getProperty(sPath+"/NextApprovers");
                var iSelIdx, oCurrRow;
                oLocalModel.setProperty("/showProcessFlow", false);
                if(!aSelRow || (aSelRow && aSelRow.length === 0)){
                    sap.m.MessageToast.show(this.getResourceBundle().getText("warAprChngOrder"));
                    return;
                }
                oCurrRow = aSelRow[0].getObject();
                iSelIdx = parseInt(aSelRow[0].getPath().split("/")[aSelRow[0].getPath().split("/").length - 1]);
                aSeq.splice(iSelIdx,1);
                if(sSrc === 'top'){
                    aSeq.unshift(oCurrRow);
                    oTable.setSelectedItem(oTable.getItems()[0]);
                } else if(sSrc === 'oneAbove'){
                    aSeq.splice(iSelIdx-1 < 0 ? 0 : iSelIdx-1, 0, oCurrRow);
                    oTable.setSelectedItem(oTable.getItems()[iSelIdx-1 < 0 ? 0 : iSelIdx-1], true);
                } else if(sSrc === 'oneBelow'){
                    aSeq.splice(iSelIdx+1 > aSeq.length ? aSeq.length : iSelIdx+1, 0, oCurrRow);
                    oTable.setSelectedItem(oTable.getItems()[iSelIdx+1 > aSeq.length ? aSeq.length : iSelIdx+1], true);
                } else if(sSrc === 'last'){
                    aSeq.push(oCurrRow);
                    oTable.setSelectedItem(oTable.getItems()[oTable.getItems().length-1]);
                }
                oLocalModel.setProperty(sPath+"/NextApprovers", $.extend(true,[],aSeq));
                this.alignSequence();
            },
            alignSequence: function(){
                var oBindingCtx = this.getView().getBindingContext("LocalModel");
                var sPath = oBindingCtx.getPath();
                var oLocalModel = this.getModel("LocalModel");
                var aSeq = oLocalModel.getProperty(sPath+"/NextApprovers");
                for(var i=0; i<aSeq.length; i++){
                    aSeq[i]['level'] = i+1;
                }
                oLocalModel.setProperty(sPath+"/NextApprovers", $.extend(true,[],aSeq));
            },
            onDeleteRow: function(oEvent){
                var oCurrentRow = oEvent.getSource().getBindingContext("LocalModel");
                var iSelIdx = parseInt(oCurrentRow.getPath().split("/")[oCurrentRow.getPath().split("/").length - 1]);
                var oBindingCtx = this.getView().getBindingContext("LocalModel");
                var sPath = oBindingCtx.getPath();
                var oLocalModel = this.getModel("LocalModel");
                var aSeq = oLocalModel.getProperty(sPath+"/NextApprovers");
                aSeq.splice(iSelIdx,1);
                oLocalModel.setProperty(sPath+"/NextApprovers", $.extend(true,[],aSeq));
                this.alignSequence();
            },
            onClearTblSel: function(){
                var oLocalModel = this.getModel("LocalModel");
                var oTable = this.getControl('idNextApproverTbl');
                oTable.removeSelections(true);
                oLocalModel.setProperty("/showProcessFlow", false);
            },
            _onCloseClaim: function(){
                var that = this;
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                var oPayload = {
                    status : "Closed",
                    statusCode : "C"
                };
                var sUrl = sServiceUrl + "ClaimSet/"+oBindingCtx.id;
                this.loadBusyIndicator("ObjectPageLayout", true);
                ReqHelper.sendUpdateReq(sUrl, oPayload).then(function (oRes) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    MessageBox.success('Closed',{
                        onClose: function () {
                            that.getRouter().navTo("main");
                        }.bind(that)
                    });
                }.bind(this))
                .catch(function (response) {
                    //////////JSON.parse(response.responseText).error.message
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that.handleCAPMErrors(response);
                }.bind(this));
            },
            /**
            * Update claim rejection to CAPM
            * @private
            */
            _onRejectToCAPM: function(){
                var that = this;
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                var iCurrLvl = oBindingCtx.currentLevel;
                var aSeqPayload = $.extend(true,[],oBindingCtx.NextApprovers);
                aSeqPayload.find(function(el){ return el.level === iCurrLvl}).statusCode = "R";
                aSeqPayload.find(function(el){ return el.level === iCurrLvl}).approvedDate = new Date();
                var oPayload = {
                    currentLevel  : null,
                    nextApprover  : null,
                    status        : "Rejected",
                    statusCode    : "R",
                    sequence      : aSeqPayload
                };
                var sUrl = sServiceUrl + "ClaimSet/"+oBindingCtx.id;
                this.loadBusyIndicator("ObjectPageLayout", true);
                ReqHelper.sendUpdateReq(sUrl, oPayload).then(function (oRes) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that._postComments(oRes);
                    MessageBox.success(that.getResourceBundle().getText("claimRejected"),{
                        onClose: function () {
                            that.getRouter().navTo("main");
                        }.bind(that)
                    });
                }.bind(this))
                .catch(function (response) {
                    //////////JSON.parse(response.responseText).error.message
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that.handleCAPMErrors(response);
                }.bind(this));
            },
            /**
            * Push approval to CAPM
            * @private
            */
           _onApproveToCAPM: function(){
                var that = this;
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                var iCurrLvl = oBindingCtx.currentLevel;
                var iTotalLevels = oBindingCtx.NextApprovers.length;
                var aSeq = oBindingCtx.NextApprovers;
                var aSeqPayload = $.extend(true,[],oBindingCtx.NextApprovers);
                var oPayload;
                aSeqPayload.find(function(el){ return el.level === iCurrLvl}).statusCode = "A";
                aSeqPayload.find(function(el){ return el.level === iCurrLvl}).approvedDate = new Date();
                if(iCurrLvl === iTotalLevels){
                    oPayload = {
                        currentLevel  : null,
                        nextApprover  : "",
                        status        : "Approved",
                        statusCode    : "A",
                        sequence      : aSeqPayload
                    };
                } else {
                    oPayload = {
                        currentLevel  : iCurrLvl+1,
                        nextApprover  : aSeq.find(function(el){ return el.level === (iCurrLvl+1)}).email,
                        sequence      : aSeqPayload
                    };
                }
                var sUrl = sServiceUrl + "ClaimSet/"+oBindingCtx.id;
                this.loadBusyIndicator("ObjectPageLayout", true);
                ReqHelper.sendUpdateReq(sUrl, oPayload).then(function (oRes) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that._postComments(oRes);
                    MessageBox.success(that.getResourceBundle().getText("approved"),{
                        onClose: function () {
                            that.getRouter().navTo("main");
                        }.bind(that)
                    });
                }.bind(this))
                .catch(function (response) {
                    //JSON.parse(response.responseText).error.message
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that.handleCAPMErrors(response);
                }.bind(this));
            },
            /**
            * Method to submit
            * @private
            */
           _onSubmitToCAPM: function(){
                var that = this;
                var oLocalModel = this.getModel("LocalModel");
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                var sRequestor = oLocalModel.getProperty("/LoggedInUserID");
                var sId = oBindingCtx.id;
                var sUrl, aNextApprovers=[];
                for(var i=0; i<oBindingCtx.NextApprovers.length; i++){
                    aNextApprovers.push({
                        name: oBindingCtx.NextApprovers[i].name,
                        email: oBindingCtx.NextApprovers[i].email,
                        level: oBindingCtx.NextApprovers[i].level,
                        statusCode: ""
                    });
                }
                
                var oPayload = {
                    claimNo  : oBindingCtx.Clmno,
                    claimActualData : oBindingCtx.ActualData,
                    sequence  : aNextApprovers,
                    currentLevel: 1,
                    nextApprover : oBindingCtx.NextApprovers.find(function(el){ return el.level === 1}).email,
                    status: "Inprogress",
                    statusCode: "IP",
                    requestor   : sRequestor
                };
                if(sId){
                    sUrl = sServiceUrl + "ClaimSet/"+sId;
                    this.loadBusyIndicator("ObjectPageLayout", true);
                    ReqHelper.sendUpdateReq(sUrl, oPayload).then(function (oRes) {
                        that.loadBusyIndicator("ObjectPageLayout",false);
                        that._postComments(oRes);
                        MessageBox.success(that.getResourceBundle().getText("requested"),{
                            onClose: function () {
                                that.getRouter().navTo("main");
                            }.bind(that)
                        });
                    }.bind(this))
                    .catch(function (response) {
                        //JSON.parse(response.responseText).error.message
                        that.loadBusyIndicator("ObjectPageLayout",false);
                        that.handleCAPMErrors(response);
                    }.bind(this));
                } else {
                    sUrl = sServiceUrl + "ClaimSet";
                    this.loadBusyIndicator("ObjectPageLayout", true);
                    ReqHelper.sendCreateReq(sUrl, oPayload).then(function (oRes) {
                        that.loadBusyIndicator("ObjectPageLayout",false);
                        that._postComments(oRes);
                        MessageBox.success(that.getResourceBundle().getText("requested"),{
                            onClose: function () {
                                that.getRouter().navTo("main");
                            }.bind(that)
                        });
                    }.bind(this))
                    .catch(function (response) {
                        that.loadBusyIndicator("ObjectPageLayout",false);
                        that.handleCAPMErrors(response);
                    }.bind(this));
                }
            },
            onSaveComments: function(){
                var that = this;
                var oLocalModel = this.getModel("LocalModel");
                var sComment = oLocalModel.getProperty("/Comment");
                var oBindingCtx = that.getView().getBindingContext("LocalModel").getObject();
                if(!sComment){
                    sap.m.MessageToast.show("Please enter comment");
                    return;
                }
                this._postComments({
                    claimNo: oBindingCtx.Clmno,
                    save: true
                });
            },
            _postComments: function(oPayload){
                var that = this;
                var oLocalModel = that.getModel("LocalModel");
                var sComment = oLocalModel.getProperty("/Comment");
                var sAction = oLocalModel.getProperty("/action");
                var sAuthorID = oLocalModel.getProperty("/LoggedInUserID");
                var sAuthorName = oLocalModel.getProperty("/LoggedInUserName");
                oPayload = {
                    claimNo  : oPayload.claimNo,
                    type  : oPayload.save ? 'Saved' : sAction,
                    comment    : sComment ? sComment : '',
                    authorID   : sAuthorID,
                    authorName  : sAuthorName
                };
                
                var sUrl = sServiceUrl + "CommentSet";
                this.loadBusyIndicator("ObjectPageLayout", true);
                ReqHelper.sendCreateReq(sUrl, oPayload).then(function (oRes) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    if(oRes.type === 'Saved'){
                        sap.m.MessageToast.show("Comment has been saved");
                        oLocalModel.setProperty("/Comment","");
                        that._getComments();
                    }
                }.bind(this))
                .catch(function (response) {
                    that.loadBusyIndicator("ObjectPageLayout",false);
                    that.handleCAPMErrors(response);
                }.bind(this));
            },
            /**
            * Method to navigate to the previous page
            * @private
            */
            _onNavBack: function () {
                var sPreviousHash = History.getInstance().getPreviousHash();
                if (sPreviousHash !== undefined && sPreviousHash !== "") {
                    history.go(-1);
                } else {
                    this.getRouter().navTo("main");
                }
            },
            handleCAPMErrors: function(oError){
                MessageBox.error("Error message", {
                    title: "Error",
                    details: JSON.parse(oError.responseText),
                    contentWidth: "100px"
                });
            },


            /**
             * Manage the Detail 
             */
            onItemDetailOpen: function (oEvent) {
                if (!this.oItemDetailDlg) {
                    this.oItemDetailDlg = sap.ui.xmlfragment("com.cnhi.btp.warrantyclaimsapproval.fragment.ItemDetail", this);
                    // to get access to the controller's model
                    this.getView().addDependent(this.oItemDetailDlg);
                }
                var oPath = oEvent.getSource().getParent().oBindingContexts.LocalModel.getPath();
                var oModel = oEvent.getSource().getParent().oBindingContexts.LocalModel.getModel();
                this.oItemDetailDlg.setBindingContext(new sap.ui.model.Context(oModel, oPath), "LocalModel");
                //this.oItemDetailDlg.setBindingContext(oEvent.getSource().getParent().oBindingContexts);
                this.oItemDetailDlg.open();
            },

            onItemDetailClose: function (oEvent) {
                this.oItemDetailDlg.close()
            },

            onDefectDetailOpen: function (oEvent) {
                var that = this;
                if (!this.oDefectDetail) {
                    this.oDefectDetail = sap.ui.xmlfragment("com.cnhi.btp.warrantyclaimsapproval.fragment.DefectExposed", this);
                    // to get access to the controller's model
                    this.getView().addDependent(this.oDefectDetail);
                }
                var oPath = oEvent.getSource().getParent().getBindingContext("LocalModel").getPath();
                var oLocalModel = oEvent.getSource().getParent().getBindingContext("LocalModel").getModel();
                var oModel = this.getOwnerComponent().getModel();
                var oDefectDetail = oLocalModel.getProperty(oPath);
                const aFilter = [
                    new Filter({
                        path: "DefectCode",
                        operator: FilterOperator.EQ,
                        value1: oDefectDetail.DefectCode,
                        value2: undefined
                    })
                ]
                oModel.read("/DefectExposedSet", {
                    filters: aFilter,
                    success: function (oData) {
                        oLocalModel.setProperty(oPath + "/DefectExposed", oData);
                        that.oDefectDetail.setBindingContext(new sap.ui.model.Context(oLocalModel, oPath), "LocalModel");
                        //this.oItemDetailDlg.setBindingContext(oEvent.getSource().getParent().oBindingContexts);
                        that.oDefectDetail.open();
                    },
                    error: function (oData) {
                        //Message is managed by 
                        /**
                        MessageBox.error("Error message", {
                            title: "Error",
                            details: that.getResourceBundle().getText("ERROR_DEFECTEXPOSED_ERROR", oDefectDetail.DefectCode),
                            contentWidth: "100px"
                        });
                        */
                    }
                });

            },


            onDefectDetailClose: function (oEvent) {
                this.oDefectDetail.close();
            },

            /**
             * on File Change
             */
            onAttachmentFileChange: function (oEvent) {
                var oFileUploader = oEvent.getSource();
                var oBindingCtx = this.getView().getBindingContext('LocalModel').getObject();
                //oFileUploader.removeAllParameters();
                /*
                var file = oEvent.getParameters("files").files[0];
                this.file = file;

                
                oFileUploader.removeAllParameters();
                var oHeaderParameter = new sap.ui.unified.FileUploaderParameter({
                    name : "slug",
                    value : oFileUploader.getValue()
                });
                oFileUploader.insertParameter(oHeaderParameter);
                var oHeaderParameter =  new sap.ui.unified.FileUploaderParameter({
                    name : "Clmno",
                    value : oBindingCtx.Clmno 
                });
                oFileUploader.insertParameter(oHeaderParameter);
                var oHeaderParameter =  new sap.ui.unified.FileUploaderParameter({
                    name : "CreatedBy",
                    value : this.getModel("LocalModel").getProperty("/LoggedInUserID")
                });
                oFileUploader.insertParameter(oHeaderParameter);
                */
                oFileUploader.removeAllHeaderParameters();
                if (!this.csrfToken) {
                    this.csrfToken = this.getView().getModel().oHeaders['x-csrf-token'];
                    oFileUploader.setSendXHR(true);
                }
                var headerTokenParma = new sap.ui.unified.FileUploaderParameter();
                headerTokenParma.setName('x-csrf-token');
                headerTokenParma.setValue(this.csrfToken);
                oFileUploader.addHeaderParameter(headerTokenParma);

                var headerParma = new sap.ui.unified.FileUploaderParameter();
                headerParma.setName('created-by');
                headerParma.setValue( this.getModel("LocalModel").getProperty("/LoggedInUserID"));
                oFileUploader.addHeaderParameter(headerParma);

                var aServiceUrl = this.getOwnerComponent().getModel().sServiceUrl;
                oFileUploader.setUploadUrl(aServiceUrl + `/AttachmentStreamSet(Clmno='${ oBindingCtx.Clmno }',FileName='${ oFileUploader.getValue()  }')/$value`);
                oFileUploader.setHttpRequestMethod('PUT');
            },
            onAttachmentFileUploadProgress: function(oEvent) {

            },
            onAttachmentFileUploadComplete: function(oEvent) {
                var vStatus = oEvent.getParameter('status');
                if ( vStatus >= 200 && vStatus <= 299  ) { //Should be 200 or 299
                    MessageToast.show("File uploaded");
                } else {
                    MessageToast.show("Error on uploading the file");

                }
                this._getAttachments();
                this._clearFileUploader();
            },
            onUploadAborted: function(oEvent) {

            },
            /**
             * On AttachmentUpload
             */
            onAttachmentUpload: function () {
                var oFileUploader = this.byId("__fileUploader");
                if (!oFileUploader.getValue()) {
                    MessageToast.show("Choose a file first");
                    return;
                }
                var oListAttachments = this.getView().byId('idListAttachments');
                var oItems = oListAttachments.getItems();
                var oFileFound = oItems.find(item => item.getText() == oFileUploader.getValue())
                if (oFileFound !== undefined) {
                    MessageBox.confirm(this.getResourceBundle().getText("Detail_TBL_Attachment_MSG_Confirm_UploadExists",oFileUploader.getValue()),{
                        icon: MessageBox.Icon.ERROR,
                        actions: [MessageBox.Action.CANCEL],
                        onClose: function(sAction){
                            if(sAction === MessageBox.Action.OK){
                                oFileUploader.upload();
                            }
                        }.bind(this)
                    });
                } else {
                    oFileUploader.upload();
                }
                
                /*
                var oImageData = {
                    "content": this.content,
                    "mediaType": oFileUploader.type,
                    "fileName": oFileUploader.name,
                    "applicationName":"comcnhiptpwarrantyclaimapproval"
                };*/
                /*
                var oFileUploader = this.byId("__fileUploader");
                oFileUploader.checkFileReadable().then(function() {
                    oFileUploader.upload();
                }, function(error) {
                    MessageToast.show("The file cannot be read. It may have changed.");
                }).then(function() {
                    oFileUploader.clear();
                });
                */
            },
            
        });
    });


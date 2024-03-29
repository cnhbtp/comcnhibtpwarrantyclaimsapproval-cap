sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "com/cnhi/btp/warrantyclaimsreport/model/ReqHelper",
], function (Controller, UIComponent, Filter, FilterOperator, ReqHelper) {
    "use strict";

    return Controller.extend("com.cnhi.btp.warrantyclaimsreport.controller.BaseController", {
        /**
         * Convenience method for accessing the router.
         * @public
         * @returns {sap.ui.core.routing.Router} the router for this component
         */
        getRouter: function () {
            return UIComponent.getRouterFor(this);
        },

        /**
         * Convenience method for getting the view model by name.
         * @public
         * @param {string} [sName] the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName) ? this.getView().getModel(sName) : this.getOwnerComponent().getModel(sName);
        },

        /**
         * Convenience method for setting the view model.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Getter for the resource bundle.
         * @public
         * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },
        /**
         * Set busy indicators for the controls
         */
        loadBusyIndicator: function (sName, bIsBusy) {
            var oControl = this.getView().byId(sName);
            oControl = oControl ? oControl : sap.ui.getCore().byId(sName);
            oControl.setBusy(bIsBusy);
        },
        /**
         * Get UI control
         */
        getControl: function (sId) {
            var oControl = this.getView().byId(sId);
            oControl = oControl ? oControl : sap.ui.getCore().byId(sId);
            return oControl;
        },

        _getWarrantyListPromise: function (busyIndicatorId, claimId) {
            var that = this;
            this.loadBusyIndicator(busyIndicatorId, true);
            return new Promise((resolve, reject) => {
                var aFinal = [], aFilter = [];
                var oLocalModel = that.getModel('LocalModel');
                var oDataModel = that.getModel();
                if (claimId != undefined || claimId != null) {
                    if (Array.isArray(claimId)) {
                        for (const item of claimId) {
                            if ( item.range.exclude  && item.range.operation === "EQ" ) {
                                item.range.operation = "NE"
                            }
                            if ( item.range.operation !== "Empty") {
                                aFilter.push(new Filter({
                                    path: "Clmno",
                                    operator: item.range.operation,
                                    value1: item.range.value1,
                                    value2: item.range.value2,
                                }));
                            }
                        }
                    } else {
                        aFilter.push(new Filter({
                            path: "Clmno",
                            operator: FilterOperator.EQ,
                            value1: claimId,
                            value2: undefined
                        }));
                    }
                }
                var oFrmDate = oLocalModel.getProperty('/FromDate')
                var oToDate  = oLocalModel.getProperty('/ToDate')
                if (oFrmDate != undefined && oFrmDate != null || oToDate != undefined || oFrmDate != null ) {
                    var oDateTimeInstance = sap.ui.core.format.DateFormat.getDateTimeInstance({
                        formatOptions: { UTC: true }
                    });

                    var oFrmDateYr = oLocalModel.getProperty('/FromDate').getFullYear();
                    var oFrmDateMnth = oLocalModel.getProperty('/FromDate').getMonth() + 1;
                    var oFrmDateDate = oLocalModel.getProperty('/FromDate').getDate();
                    var oFrmttdFrmDate = new Date([oFrmDateYr, oFrmDateMnth, oFrmDateDate].join('-'));
                    oFrmttdFrmDate.setDate(oFrmttdFrmDate.getDate());

                    
                    aFilter.push(new Filter({
                        path: "SubDate",
                        operator: FilterOperator.BT,
                        value1: oFrmttdFrmDate,
                        value2: oLocalModel.getProperty('/ToDate')
                    }));
                } 
                oLocalModel.setProperty("/Results", []);
                oDataModel.read("/WarrantyListSet", {
                    filters: aFilter,
                    success: async function (oData) {
                        if (oData.results.length > 0) {
                            var aUniqueClaims = [...new Set(oData.results.map(function (el) {
                                return el.Clmno;
                            }))];
                            for (var i = 0; i < aUniqueClaims.length; i++) {
                                var aItems = oData.results.filter(function (el) {
                                    return el.Clmno === aUniqueClaims[i];
                                });
                                if (aItems.length > 0) {
                                    var oHeader = aItems[0];
                                    oHeader.Items = $.extend(true, [], aItems);
                                    oHeader.ActualData = JSON.stringify(aItems[0]);
                                    aFinal.push(oHeader);
                                }
                            }
                            //oLocalModel.setProperty("/Results", $.extend(true, [], aFinal));
                            resolve(await that._getClaimsFromCAPMPromise(busyIndicatorId, $.extend(true, [], aFinal)));
                        } else {
                            that.loadBusyIndicator(busyIndicatorId, false);
                            resolve([]);

                        }
                    },
                    error:function (oError) {
                        that.loadBusyIndicator(busyIndicatorId, false);
                        reject(oError);
                    }
                });
            });
        },

        getIconForMimeType: function(sMimeType) {
            return sap.ui.core.IconPool.getIconForMimeType(sMimeType)
        },

        _getClaimsFromCAPMPromise: function (busyIndicatorId, results) {
            return new Promise((resolve, reject) => {


                var that = this;
                var sServiceUrl = this.getOwnerComponent().getModel("ClaimApprovalCAP").sServiceUrl;
                var oLocalModel = this.getModel('LocalModel');
                var bIsRequestor = oLocalModel.getProperty("/IsRequestorLoggedIn");
                var sLoggedInUserID = oLocalModel.getProperty("/LoggedInUserID");
                var aResults = results ? results : [];
                var sUrl = sServiceUrl + "ClaimSet";
                var aFinal = [], oRowObj;
                ReqHelper.sendGetReq(sUrl).then(function (oRes) {
                    
                    //if(oRes.value.length > 0){
                    if (bIsRequestor) {
                        for (var i = 0; i < aResults.length; i++) {
                            var iIdx = oRes.value.findIndex(function (el) {
                                return el.claimNo === aResults[i].Clmno;
                            });
                            aResults[i]['IsRequestor'] = true;
                            aResults[i]['IsApprover'] = false;
                            if (iIdx >= 0) {
                                //if (oRes.value[iIdx].statusCode === 'C') {
                                //    aResults[i]['nextApprover'] = '';
                                //    aResults[i]['currentLevel'] = null;
                                //    aResults[i]['NextApprovers'] = [];

                                //    aResults[i]['uistatus'] = that.getResourceBundle().getText("notSubmitted");
                                //    aResults[i]['uistatusstate'] = "None";
                                //} else {
                                    aResults[i]['id'] = oRes.value[iIdx].id;
                                    aResults[i]['nextApprover'] = oRes.value[iIdx].nextApprover;
                                    aResults[i]['currentLevel'] = oRes.value[iIdx].currentLevel;
                                    aResults[i]['NextApprovers'] = oRes.value[iIdx].sequence ? oRes.value[iIdx].sequence : [];
                                    aResults[i]['CAPMStatusCode'] = oRes.value[iIdx].statusCode;
                                    aResults[i]['WorkflowStatus'] = oRes.value[iIdx].statusCode === 'A' ? 'Approved' : oRes.value[iIdx].statusCode === 'IP' ? 'Inprogress' : oRes.value[iIdx].statusCode === 'C' ? 'Completed' : oRes.value[iIdx].statusCode === 'R' ? 'Rejected' : 'None';

                                    if (oRes.value[iIdx].statusCode === 'IP') {
                                        aResults[i]['uistatus'] = that.getResourceBundle().getText("uiStatus", [oRes.value[iIdx].currentLevel]);
                                        aResults[i]['uistatusstate'] = "Warning";
                                    } else if (oRes.value[iIdx].statusCode === 'A') {
                                        aResults[i]['uistatus'] = that.getResourceBundle().getText("claimApproved");
                                        aResults[i]['uistatusstate'] = "Success";
                                    }else if (oRes.value[iIdx].statusCode === 'C') {
                                        aResults[i]['uistatus'] = that.getResourceBundle().getText("claimCompleted");
                                        aResults[i]['uistatusstate'] = "Information";
                                    }else if (oRes.value[iIdx].statusCode === 'R') {
                                        aResults[i]['uistatus'] = that.getResourceBundle().getText("claimRejected");
                                        aResults[i]['uistatusstate'] = "Error";
                                    } else {
                                        aResults[i]['uistatus'] = that.getResourceBundle().getText("notSubmitted");
                                        aResults[i]['uistatusstate'] = "None";
                                    }
                                //}
                                var oMultiUiStatus = oLocalModel.getProperty("/MultiUiStatus");
                                if ( oMultiUiStatus == undefined || oMultiUiStatus == null || oMultiUiStatus.find(i => i === oRes.value[iIdx].statusCode) != undefined){
                                    aFinal.push(aResults[i]);
                                }
                                
                            } else {
                                aResults[i]['nextApprover'] = '';
                                aResults[i]['currentLevel'] = null;
                                aResults[i]['NextApprovers'] = [];

                                aResults[i]['uistatus'] = that.getResourceBundle().getText("notSubmitted");
                                aResults[i]['uistatusstate'] = "None";
                                var oMultiUiStatus = oLocalModel.getProperty("/MultiUiStatus");
                                if ( oMultiUiStatus == undefined || oMultiUiStatus == null || oMultiUiStatus.find(i => i === 'C') != undefined){
                                    aFinal.push(aResults[i]);
                                }
                                
                            }
                        }
                    } else {
                        for (var iIdx = 0; iIdx < oRes.value.length; iIdx++) {
                            oRowObj = {};
                            if (oRes.value[iIdx].nextApprover === sLoggedInUserID) {
                                oRowObj['id'] = oRes.value[iIdx].id;
                                oRowObj['nextApprover'] = oRes.value[iIdx].nextApprover;
                                oRowObj['currentLevel'] = oRes.value[iIdx].currentLevel;
                                oRowObj['NextApprovers'] = oRes.value[iIdx].sequence ? oRes.value[iIdx].sequence : [];
                                oRowObj['CAPMStatusCode'] = oRes.value[iIdx].statusCode;
                                oRowObj['WorkflowStatus'] = oRes.value[iIdx].statusCode === 'A' ? 'Approved' : oRes.value[iIdx].statusCode === 'IP' ? 'Inprogress' : oRes.value[iIdx].statusCode === 'C' ? 'Completed' : oRes.value[iIdx].statusCode === 'R' ? 'Rejected' : 'None';

                                oRowObj['IsRequestor'] = false;
                                oRowObj['IsApprover'] = true;
                                oRowObj['uistatus'] = that.getResourceBundle().getText("uiStatus", [oRes.value[iIdx].currentLevel]);
                                oRowObj['uistatusstate'] = "Warning";

                                oRowObj = Object.assign(oRowObj, JSON.parse(oRes.value[iIdx].claimActualData));
                                for (const iterator of ["CreateDate","FailureDate","RepairStart","RepairEnd","ManDate","SubDate"]) {
                                    oRowObj[iterator] = typeof oRowObj[iterator] === 'string' ? new Date(oRowObj[iterator]) : oRowObj[iterator]; 
                                }
                                /*
                                oRowObj.CreateDate = typeof oRowObj.CreateDate === 'string' ? new Date(oRowObj.CreateDate) : oRowObj.CreateDate;
                                oRowObj.FailureDate = typeof oRowObj.FailureDate === 'string' ? new Date(oRowObj.FailureDate) : oRowObj.FailureDate;
                                oRowObj.RepairStart = typeof oRowObj.RepairStart === 'string' ? new Date(oRowObj.RepairStart) : oRowObj.RepairStart;
                                oRowObj.RepairEnd = typeof oRowObj.RepairEnd === 'string' ? new Date(oRowObj.RepairEnd) : oRowObj.RepairEnd;
                                oRowObj.ManDate = typeof oRowObj.ManDate === 'string' ? new Date(oRowObj.ManDate) : oRowObj.ManDate;
                                oRowObj.SubDate
                                */
                                aFinal.push(oRowObj);
                            }
                        }
                    }
                    oLocalModel.setProperty("/Results", $.extend(true, [], aFinal));
                    that.loadBusyIndicator(busyIndicatorId, false);
                    //}
                    //that._rebindTable();
                    resolve();
                }.bind(this))
                .catch(function (response) {
                    that.loadBusyIndicator(busyIndicatorId, false);
                    reject(response)
                }.bind(this));
            });
        },
        getIDFilter: function(aFilter, Id) {
            if ( aFilter == undefined || aFilter == null) {
                aFilter = [];
            }
            if (Id != undefined || Id != null) {
                if (Array.isArray(Id)) {
                    for (const item of Id) {
                        if ( item.range.exclude  && item.range.operation === "EQ" ) {
                            item.range.operation = "NE"
                        }
                        if ( item.range.operation !== "Empty") {
                            aFilter.push(new Filter({
                                path: "id",
                                operator: item.range.operation,
                                value1: item.range.value1,
                                value2: item.range.value2,
                            }));
                        }
                    }
                } else {
                    aFilter.push(new Filter({
                        path: "id",
                        operator: FilterOperator.EQ,
                        value1: Id,
                        value2: undefined
                    }));
                }
            }
            return aFilter;
        },
        getClaimNoFilter: function(aFilter, claimId) {
            if ( aFilter == undefined || aFilter == null) {
                aFilter = [];
            }
            if (claimId != undefined || claimId != null) {
                if (Array.isArray(claimId)) {
                    for (const item of claimId) {
                        if ( item.range.exclude  && item.range.operation === "EQ" ) {
                            item.range.operation = "NE"
                        }
                        if ( item.range.operation !== "Empty") {
                            aFilter.push(new Filter({
                                path: "claimNo",
                                operator: item.range.operation,
                                value1: item.range.value1,
                                value2: item.range.value2,
                            }));
                        }
                    }
                } else {
                    aFilter.push(new Filter({
                        path: "claimNo",
                        operator: FilterOperator.EQ,
                        value1: claimId,
                        value2: undefined
                    }));
                }
            }
            return aFilter;
        },
        getDateFilter: function(aFilter, oLocalModel) {
            if ( aFilter == undefined || aFilter == null) {
                aFilter = [];
            }
            var oFrmDate = oLocalModel.getProperty('/FromDate')
            var oToDate  = oLocalModel.getProperty('/ToDate')
            if (oFrmDate != undefined && oFrmDate != null || oToDate != undefined || oFrmDate != null ) {
                var oDateTimeInstance = sap.ui.core.format.DateFormat.getDateTimeInstance({
                    formatOptions: { UTC: true }
                });

                var oFrmDateYr = oLocalModel.getProperty('/FromDate').getFullYear();
                var oFrmDateMnth = oLocalModel.getProperty('/FromDate').getMonth();
                var oFrmDateDate = oLocalModel.getProperty('/FromDate').getDate();
                var oFrmttdFrmDate = new Date(Date.UTC(oFrmDateYr, oFrmDateMnth, oFrmDateDate, 0, 0 , 0));
                oFrmttdFrmDate.setDate(oFrmttdFrmDate.getDate());

                var oToDateYr = oLocalModel.getProperty('/ToDate').getFullYear();
                var oToDateMnth = oLocalModel.getProperty('/ToDate').getMonth();
                var oToDateDate = oLocalModel.getProperty('/ToDate').getDate();
                var oFrmttToDate = new Date(Date.UTC(oToDateYr, oToDateMnth, oToDateDate, 23, 59 , 59));
                oFrmttToDate.setDate(oFrmttToDate.getDate());
                
                /*
                var oFrmDateYr = oLocalModel.getProperty('/FromDate').getFullYear();
                var oFrmDateMnth = oLocalModel.getProperty('/FromDate').getMonth() + 1;
                var oFrmDateDate = oLocalModel.getProperty('/FromDate').getDate();
                var oFrmttdFrmDate = new Date([oFrmDateYr, oFrmDateMnth, oFrmDateDate].join('-'));
                oFrmttdFrmDate.setDate(oFrmttdFrmDate.getDate());
                */

                
                aFilter.push(new Filter({
                    path: "subDate",
                    operator: FilterOperator.BT,
                    value1: oFrmttdFrmDate,
                    value2: oFrmttToDate//oLocalModel.getProperty('/ToDate')
                }));
            } 
            return aFilter;
        },
        getStatusFilter: function(aFilter, oLocalModel) {
            if ( aFilter == undefined || aFilter == null) {
                aFilter = [];
            }
            var oMultiUiStatus = oLocalModel.getProperty("/MultiUiStatus");
            if (oMultiUiStatus !== undefined ){
                for (const status of oMultiUiStatus) {
                    aFilter.push(new Filter({
                        path: "statusCode",
                        operator:  FilterOperator.EQ,
                        value1: status,
                        value2: undefined,
                    }));
                }
            }
            return aFilter;
        },
        _buildFilters: function(claimId) {
            var buildFilter = "";
            if (claimId != undefined || claimId != null) {
                if (Array.isArray(claimId)) {
                    for (const item of claimId) {
                        if ( item.range.exclude  && item.range.operation === "EQ" ) {
                            item.range.operation = "NE"
                        }
                        if ( item.range.operation !== "Empty") {
                            if ( buildFilter !== "" ) {
                                buildFilter = buildFilter + ' and';
                            }
                            buildFilter = buildFilter + ' claimId ' + item.range.operation; 
                            aFilter.push(new Filter({
                                path: "Clmno",
                                operator: item.range.operation,
                                value1: item.range.value1,
                                value2: item.range.value2,
                            }));
                        }
                    }
                } else {
                    aFilter.push(new Filter({
                        path: "Clmno",
                        operator: FilterOperator.EQ,
                        value1: claimId,
                        value2: undefined
                    }));
                }
            }
            return buildFilter;
        },
        _mapWarrantyTable: function(oClaimReportSet,oWarrantySet) {
            var aFinal = [],
                oLocalModel = this.getOwnerComponent().getModel('LocalModel');
            for (let iIdx = 0; iIdx < oClaimReportSet.length; iIdx++) {
                var oRowObj = {};
                var oWarrantySetItem = oWarrantySet.find(item => item.Clmno === oClaimReportSet[iIdx].claimNo)
                oRowObj['id'] = oClaimReportSet[iIdx].id;
                oRowObj['nextApprover'] = oClaimReportSet[iIdx].nextApprover;
                oRowObj['currentLevel'] = oClaimReportSet[iIdx].currentLevel;
                oRowObj['NextApprovers'] = oClaimReportSet[iIdx].sequence ? oClaimReportSet[iIdx].sequence : [];
                oRowObj['CAPMStatusCode'] = oClaimReportSet[iIdx].statusCode;
                oRowObj['WorkflowStatus'] = oClaimReportSet[iIdx].statusCode === 'A' ? 'Approved' : oClaimReportSet[iIdx].statusCode === 'IP' ? 'Inprogress' : oClaimReportSet[iIdx].statusCode === 'C' ? 'Completed' : oClaimReportSet[iIdx].statusCode === 'R' ? 'Rejected' : 'None';

                oRowObj['IsRequestor'] = true;
                oRowObj['IsApprover'] = false;
                oRowObj['uistatus'] = this.getResourceBundle().getText("uiStatus", [oClaimReportSet[iIdx].currentLevel]);
                if (oClaimReportSet[iIdx].statusCode === 'IP') {
                    oRowObj['uistatus'] = this.getResourceBundle().getText("uiStatus", [oClaimReportSet[iIdx].currentLevel]);
                    oRowObj['uistatusstate'] = "Warning";
                } else if (oClaimReportSet[iIdx].statusCode === 'A') {
                    oRowObj['uistatus'] = this.getResourceBundle().getText("claimApproved");
                    oRowObj['uistatusstate'] = "Success";
                }else if (oClaimReportSet[iIdx].statusCode === 'C') {
                    oRowObj['uistatus'] = this.getResourceBundle().getText("claimCompleted");
                    oRowObj['uistatusstate'] = "Information";
                }else if (oClaimReportSet[iIdx].statusCode === 'R') {
                    oRowObj['uistatus'] = this.getResourceBundle().getText("claimRejected");
                    oRowObj['uistatusstate'] = "Error";
                } else {
                    oRowObj['uistatus'] = this.getResourceBundle().getText("notSubmitted");
                    oRowObj['uistatusstate'] = "None";
                }
                oRowObj['ActualData'] = oClaimReportSet[iIdx].claimActualData;

                oRowObj = Object.assign(oRowObj, JSON.parse(oClaimReportSet[iIdx].claimActualData));
                for (const iterator of ["CreateDate","FailureDate","RepairStart","RepairEnd","ManDate","SubDate"]) {
                    oRowObj[iterator] = typeof oRowObj[iterator] === 'string' ? new Date(oRowObj[iterator]) : oRowObj[iterator]; 
                }
                oRowObj = Object.assign(oRowObj, oWarrantySetItem);
                oWarrantySetItem
                aFinal.push(oRowObj);
            }
            oLocalModel.setProperty("/Results", $.extend(true, [], aFinal));
        },
        _getWarrantyClaimSet: function(ClaimFilter) {
            var oModel = this.getOwnerComponent().getModel(),
                aFilters = [];
            return new Promise((resolve, reject) => {
                aFilters =  ClaimFilter.map(item => new Filter({
                    path: "Clmno",
                    operator: 'EQ',
                    value1: item.claimNo,
                    value2: null,
                })); 
                oModel.read("/WarrantyListSet", {
                    filters: aFilters,
                    success: function (oRes) {
                        resolve(oRes.results);
                    },
                    error:function (oError) {
                        reject(oError);
                    }
                })
            });
        },
        _getClaimReportSet: function(claimFilter) {
            var oLocalModel = this.getOwnerComponent().getModel('LocalModel'),
                oCAPMMOdelv2 = this.getOwnerComponent().getModel('ClaimApprovalCAPV2'),  
                aFilters = [];
            var claimIds = claimFilter.claimNo ? claimFilter.claimNo : [];
            var IDs = claimFilter.id ? claimFilter.IDs : [];
            aFilters = this.getIDFilter(aFilters, IDs);
            aFilters = this.getClaimNoFilter(aFilters, claimIds);
            aFilters = this.getDateFilter(aFilters,oLocalModel);
            aFilters = this.getStatusFilter(aFilters,oLocalModel);
            return new Promise((resolve, reject) => {
                oCAPMMOdelv2.read("/ClaimReportSet", {
                    filters: aFilters,
                    success: async function (oRes) {
                        resolve(oRes.results);
                    },
                    error:function (oError) {
                        reject(oError);
                    }
                });
            });
        },
        _getWarrantyListPromise2: function(busyIndicatorId, claimFilter) {
            this.loadBusyIndicator(busyIndicatorId, true);
            return new Promise((resolve,reject) => {
                this._getClaimReportSet(claimFilter).then(oClaimReportSet => {
                    this._getWarrantyClaimSet(oClaimReportSet).then(oWarrantySet => {
                        this._mapWarrantyTable(oClaimReportSet,oWarrantySet);
                        this.loadBusyIndicator(busyIndicatorId, false);
                        resolve(); 
                    }).catch(oError => {
                        this.loadBusyIndicator(busyIndicatorId, false);
                        reject(oError);
                    });
                }).catch(oError => {
                    this.loadBusyIndicator(busyIndicatorId, false);
                    reject(oError);
                })
            });          
       }
    });

});
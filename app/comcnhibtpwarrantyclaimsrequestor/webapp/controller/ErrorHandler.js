sap.ui.define([
    "sap/ui/base/Object",
    'sap/ui/model/json/JSONModel',
    "sap/m/MessageBox",
    'sap/m/Dialog',
    'sap/m/Button',
    'sap/m/MessageItem',
	'sap/m/MessageView',
    "sap/ui/core/BusyIndicator"
], function (UI5Object, JSONModel, MessageBox, Dialog, Button,  MessageItem, MessageView, BusyIndicator) {
    "use strict";

    return UI5Object.extend("com.cnhi.btp.warrantyclaimsrequestor.controller.ErrorHandler", {

        _mapMessageType(messageTypeSap) {
            switch (messageTypeSap) {
                case 'error':
                    return sap.ui.core.MessageType.Error;
                case 'warning': 
                    return sap.ui.core.MessageType.Warning;
                case 'success': 
                    return sap.ui.core.MessageType.Success;
                case 'information': 
                    return sap.ui.core.MessageType.Information;
                default:
                    return sap.ui.core.MessageType.None;
            }
        },

        /**
        * Handles application errors by automatically attaching to the model events and displaying errors when needed.
        * @class
        * @param {sap.ui.core.UIComponent} oComponent reference to the app's component
        * @public
        * @alias qil.ovp.controller.ErrorHandler
        */
        constructor: function (oComponent) {
            this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
            this._oComponent = oComponent;
            this._oModel = oComponent.getModel();
            this._bMessageOpen = false;
            this._sErrorText = this._oResourceBundle.getText("errorText");

            this._oModel.attachMetadataFailed(function (oEvent) {
                BusyIndicator.hide();
                var oParams = oEvent.getParameters();
                this._showServiceError(oParams.response);
            }, this);

            this._oModel.attachRequestFailed(function (oEvent) {
                BusyIndicator.hide();
                var oParams = oEvent.getParameters();
                var aErrDetails;
                var sRes = oParams.response;
                var sDetails = sRes;
                if(!sRes.headers["Content-Type"] || (sRes.headers["Content-Type"] && sRes.headers["Content-Type"].indexOf('xml') !== -1)){
                    if(sRes && sRes.responseText && jQuery.parseXML(sRes.responseText).getElementsByTagName("message")){
                        sDetails = jQuery.parseXML(sRes.responseText).getElementsByTagName("message")[0].innerHTML;
                    }
                } else {
                    if(sRes && sRes.responseText && JSON.parse(sRes.responseText) && JSON.parse(sRes.responseText).error && JSON.parse(sRes.responseText).error.innererror){
                        //Manage the error coming from SAP
                        var oErrorResponse = JSON.parse(sRes.responseText);
                        if ( oErrorResponse.error.code === "SY/530" ) {
                            var oErrorViewMessage = oErrorResponse.error.innererror.errordetails.map(errordetail => ({ type: this._mapMessageType(errordetail.severity), title: errordetail.code, subtitle: errordetail.message }));
                            return this._showMessageViewError(oErrorViewMessage)
                        } else {
                        //Manage other kind of error
                        aErrDetails = oErrorResponse.error.innererror.errordetails;
                        if(aErrDetails && aErrDetails.length > 0){
                            if(aErrDetails.length === 1){
                                sDetails = aErrDetails[0].message;       
                            } else {
                                sDetails = aErrDetails.find(function(el){ return el.code === ''}) ? aErrDetails.find(function(el){ return el.code === ''}).message : sDetails;   
                            }                   
                        } else {
                            if(oErrorResponse.error.message && oErrorResponse.error.message.value){
                                sDetails = oErrorResponse.error.message.value;
                            }
                        }
                        }

                    }
                }
                this._showServiceError(sDetails);
            }, this);
        },

        _showMessageViewError: function (oMessages) {
            var that = this;
            if (this._bMessageOpen) {
                return;
            }
            this._bMessageOpen = true;
            var oMessageTemplate = new MessageItem({
				type: '{type}',
				title: '{title}',
				description: '{description}',
				subtitle: '{subtitle}',
				counter: '{counter}',
				markupDescription: '{markupDescription}'
			});

            this.oMessageView = new MessageView({
				showDetailsPageHeader: false,
				itemSelect: function () {
				},
				items: {
					path: "/",
					template: oMessageTemplate
				}
			});
            var oModel = new JSONModel();

			oModel.setData(oMessages);
            this.oMessageView.setModel(oModel);
            this.oDialog = new Dialog({
				resizable: true,
				content: this.oMessageView,
				state: 'Error',
				beginButton: new Button({
					press: function () {
                        that._bMessageOpen = false;
						this.getParent().close();
					},
					text: "Close"
				}),
                title: "Error from SAP ERP ",
				contentHeight: "50%",
				contentWidth: "50%",
				verticalScrolling: false
			});
            this.oDialog.open();
        },

        /**
        * Shows a {@link sap.m.MessageBox} when a service call has failed.
        * Only the first error message will be display.
        * @param {string} sDetails a technical error to be displayed on request
        * @private
        */
        _showServiceError: function (sDetails) {
            if (this._bMessageOpen) {
                return;
            }
            this._bMessageOpen = true;
            MessageBox.error(this._sErrorText,
                {
                    id: "serviceErrorMessageBox",
                    details: sDetails,
                    actions: [MessageBox.Action.CLOSE],
                    onClose: function () {
                        this._bMessageOpen = false;
                    }.bind(this)
                }
            );
        }

    });

}
);

// ==UserScript==
// @name                Rabobank Internetbankieren auto-input
// @namespace           FelixAkk
// @description         Automatically input your bank account and card number using an easy selection box with
//                      neat extra features. Works on any Rabobank login page and payment page (also iDeal).
// @include             https://bankieren.rabobank.nl/klanten*
// @include             https://bankieren.rabobank.nl/rib/*
// @include             https://betalen.rabobank.nl/ide/qslo*
// @include             https://betalen.rabobank.nl/ideal-betaling/*
// @grant               GM_setValue
// @grant               GM_getValue
// @grant               GM_listValues
// @grant               GM_deleteValue
// @grant               GM_addStyle
// @require             http://ajax.googleapis.com/ajax/libs/jquery/2.0.2/jquery.min.js
// ==/UserScript==

/*jslint undef: true, vars: true, newcap: true, maxerr: 50, maxlen: 200, indent: 4 */

/**
 * The `jslint` comment is an annotation with flags for JSLint.com and alike tools. Some explanation on the options:
 *
 * browser: true        Will make it accept use of document, window, JSON and such without declaration
 * vars: true           Tollerate many seperate variable declarations
 * maxlen: 200          Set the maximum line length to 200 characters
 * undef: true          Tollerate usage of undefined functions. To accept GM_* functions.
 * plusplus: true       Tollerate ++ and -- operators. Just shush already, I just them responsibly.
 */

/**
 * The global annotation is also for JSLint, which will tell it not to whine about the declaration
 */
/*global GM_setValue, GM_getValue, GM_listValues, GM_deleteValue, window, document */

// http://stackoverflow.com/questions/1335851/what-does-use-strict-do-in-javascript-and-what-is-the-reasoning-behind-it
(function () {
	"use strict";
	// --------------- General settings -------------------
	// tweak it to your own likings (script may malfunction on bad values)

	// Want me to fill in your default/primary account automatically as a page loads?
	var autoFillDefault = true,
		// Change to the account you want to select from the accountsArray (start counting from zero).
		defaultAccount = 0,
		// Time in miliseconds to wait for Rabobank's native JavaScript that's ran on DOM-ready to finish.
		// Increase this if you see your account selected but not filled in.
		autoFillDelay = 1000,
		// Optionally you can also choose your account through the GreaseMonkey command menu (off by default)
		GMMenu = false,
		// Want me to remove that puny original Rabobank 'remember my card' checkbox?
		// It's bugged, and I just made it obsolete... Yeah, that's what I though :)
		removeOriginalRemember = true;

	// ---------------- CSS/Stylesheet --------------------

	var stylesheet =
	'div#account_selection {'+
	'    margin-bottom: 20px;'+
	'    margin-left: 196px;'+
	'    margin-right: 196px;'+
	'    width: 528px;'+
	'}'+
	'div#account_selection table#accounts {'+
	'    background: none repeat scroll 0 0 White;'+
	'    border: 1px solid #CCCCCC;'+
	'    margin: 10px;'+
	'    padding: 5px;'+
	'    width: 96%;'+
	'}'+
	'table#accounts th {'+
	'    text-align: left;'+
	'}'+
	'table#accounts td.account_name label {'+
	'    display: inline-block;'+
	'    max-width: 200px;'+
	'    overflow: hidden;'+
	'    text-overflow: ellipsis;'+
	'    vertical-align: middle;'+
	'    white-space: nowrap;'+
	'    word-wrap: normal;'+
	'}'+
	'table#accounts td.account_name label {'+
	'}'+
	'a.edit {'+
	'    background: no-repeat scroll 0 0 transparent;'+
	'    display: block;'+
	'    margin: 10px;'+
	'    padding-left: 25px;'+
	'}'+
	'a.edit.enter {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/page_white_edit.png");'+
	'}'+
	'a.edit.exit {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/page_white_put.png");'+
	'}'+
	'a.account_btn {'+
	'    background: no-repeat scroll 0 0 transparent;'+
	'    display: inline-block;'+
	'    height: 16px;'+
	'    margin: 0 0 0 5px;'+
	'    opacity: 0.3;'+
	'    vertical-align: text-bottom;'+
	'    width: 16px;'+
	'}'+
	'a.account_btn:hover {'+
	'    opacity: 1;'+
	'}'+
	'a.add_account {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/add.png");'+
	'}'+
	'a.delete_account {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/delete.png");'+
	'}';

	// Construct selection panel DOM
	var selectionPanel =
	// I'll employ the styles of the Rabobank CSS classes .imgstripe, .newpanel to make it look identical.
	'<div id="account_selection" class="imgstripe newpanel">'+
	'  <form>'+
	'    <table id="accounts">'+
	// Static table header
	'      <tr>'+
	'        <th colspan="2">Selecteer uw Rabobank rekening</th>'+
	'        <th>Rekening nummer</th>'+
	'        <th>Kaart nummer</th>'+
	'      </tr>'+
	// The DOM structure of a row containing the selectable accounts on display
	'      <tr class="selectable-account">'+
	'        <td><input type="radio"/></td>'+
	'        <td><label>Account description</label></td>'+
	'        <td><label>123456789</label></td>'+
	'        <td><label>1234</label></td>'+
	'      </tr>'+
	// The DOM structure of a row for editing an account
	'      <tr class="editable-account">'+
	'        <td colspan="2"><input type="text" size="30" value="Account description"/></td>'+
	'        <td><input type="text" maxlength="9" size="9" value="123456789"/></td>'+
	'        <td>'+
	'          <input type="text" maxlength="4" size="4" value="1234"/>'+
	'          <a href="#" class="account_btn add_account"></a>'+
	'          <a href="#" class="account_btn delete_account"></a>'+
	'        </td>'+
	'      </tr>'+
	'    </table>'+
	'  <form>'+
	// The edit button
	'  <a href="#" class="edit enter">Rekeningen instellen...</a>'+
	'  <a href="#" class="edit exit">Veranderingen opslaan</a>'+
	'</div>'
	selectionPanel = $(selectionPanel);

	// Account object
	function Account(descr, acc, card) {
		this.description = descr;
		this.number = acc;
		this.cardNumber = card;
	}

	// Define whether the page is in the editing stage
	var editing = false;
	// Example accounts
	var examples = [
		new Account("Bijv. Privé coulante rekening", 123456789, 1234),
		new Account("Bijv. Spaar rekening", 123456789, 1234),
		new Account("Bijv. Zakelijke rekening", 123456789, 1234)
	];

	// Prefetch storage
	var accountsJSON = GM_getValue('accountsJSON');
	// Actual accounts
	var accountsArray;
	// If we have no values stored yet (first run), initialize the storage with example values
	if (accountsJSON === undefined) {
		GM_setValue('accountsJSON', JSON.stringify(examples));
		accountsArray = examples;
	} else {
		// Else load the bank accounts
		accountsArray = JSON.parse(accountsJSON);
	}

	// Utility index, to be used in loops
	var idx;
	var d = window.document;

	// Utility function that takes a bank account number and returns it seperated by points like on the Rabobank cards
	function numberFormat(account) {
		var nr = String(account);
		return nr.substring(0, 4) + '.' + nr.substring(4, 6) + '.' + nr.substring(6);
	}

	// Build accounts table contents (the rows), depending on whether we're editing (true) or selecting (false)
	function constructTableContents(editing) {
		return 44;
	}


	// Define event handling function for selecting an account; fills in the account details
	function selectAccount(idx) {
		d.getElementById('AuthIdv4').value = accountsArray[idx].number;
		d.getElementById('AuthBpasNrv4').value = accountsArray[idx].cardNumber;
		if (location.host === "bankieren.rabobank.nl" && (
				location.pathname === "/klanten" ||
				location.pathname === "/klanten/qslad.htm" ||
				location.pathname === "/rib/rib.cgi" ||
				location.pathname === "/ide/qslo.htm"
			)) {
			d.getElementById("AuthCdv4").focus();
		} else if (location.host === "betalen.rabobank.nl") {
			d.getElementById("SignCdv4").focus();
		} else {
			window.alert(
				"Rabobank site location not recognised.\nShould be either:\n\t'bankieren.rabobank.nl/klanten'" +
				"\nor\n\t'bankieren.rabobank.nl//klanten/qslad.htm'" +
				"\nor\n\t'bankieren.rabobank.nl/rib/rib.cgi'" +
				"\nor\n\t'bankieren.rabobank.nl/ide/qslo.htm'" +
				"\nbut was\n\t'" + location.host + location.pathname +
				"'\n. Will attempt to continue executing script anyways.");
		}
	}

	// Define event handling function for deleting an account/row in the accounts table when editing accounts
	function deleteAccount(accountIdx) {
		var element;
		// A little trickery to get this function to work as a event listener for HTML elements and also as a procedural
		// function that automatically select the default when called without arguments.
		if (arguments.length === 1)
			element = d.getElementById('accounts').getElementsByTagName('tr')[accountIdx+1];
		if (this.tagName)
			element = this.parentNode.parentNode;

		element.parentNode.removeChild(element);
	}

	// Define event handling function for inserting an account/row in the accounts table after a given index (when editing accounts)
	function addAccount(accountIdx) {
		var element;
		// A little trickery to get this function to work as a event listener for HTML elements and also as a procedural
		// function that automatically select the default when called without arguments.
		if (arguments.length === 1)
			element = d.getElementById('accounts').getElementsByTagName('tr')[accountIdx+1];
		if (this.tagName)
			element = this.parentNode.parentNode;

		var newRow = element.cloneNode(true);
		// Reset the opacity of the clone to idle, because it'll have the value sampled from the active button
		newRow.getElementsByTagName('a')[1].style.opacity = op;
		// Insert a duplicate after
		element.parentNode.insertBefore(newRow, element.nextSibling);
		// Re-register event listeners so the new row also listens
		registerEventListeners(editing);
	}

	// Define event handling function for changing the style of the add/delete buttons
	function buttonOver() {
		this.style.opacity = 1;
	}
	function buttonOut() {
		this.style.opacity = op;
	}


	// Define event handling function for editing the account (turns them into a form)
	function editAccounts() {
		// If we were editing get the stuff entered and save it
		if (editing) {
			var rows = d.getElementById('accounts').getElementsByTagName('tr');
			accountsArray = []; // new array, clean slate
			// Fill array
			for (idx = 1; idx < rows.length; idx++) {
				accountsArray.push(new Account(
					rows[idx].getElementsByTagName('input')[0].value,
					rows[idx].getElementsByTagName('input')[1].value,
					rows[idx].getElementsByTagName('input')[2].value
				));
			}
			// Save it all
			GM_setValue('accountsJSON', JSON.stringify(accountsArray));
			// Restore the edit button/link
			d.getElementById('edit').style.backgroundImage = 'url("http://www.famfamfam.com/lab/icons/silk/icons/page_white_edit.png")';
			d.getElementById('edit').innerHTML = "Rekeningen instellen...";

		// Else if we weren't and are entering editing mode; adapt the GUI to display the save button/link
		} else {
			d.getElementById('edit').style.backgroundImage = 'url("http://www.famfamfam.com/lab/icons/silk/icons/page_white_put.png")';
			d.getElementById('edit').innerHTML = "Veranderingen opslaan";
		}
		// We're done; flip editing mode
		editing = !editing;
		// Set the contents to the new mode
		d.getElementById('accounts').innerHTML = constructTableContents(editing);
		// Re-register event listeners
		registerEventListeners(editing);
	}

	// Function to add an menu item to the GreaseMonkey command item to select your account.
	// This function is necessary to get 'idx' to be a seperate variable at runtime instead of the end value of the 'idx' variable of the insertPanel function.
	function addGMMenuItem(idx) {
		// Format caption like '1. Account description (12345689 : 1234)'
		var caption = (idx + 1) + '. ' + accountsArray[idx].description + '  (' + numberFormat(accountsArray[idx].number) + ' : ' + accountsArray[idx].cardNumber + ')';
		// Have to wrap the select account function in an anonymous function to create a closure with the index parameter bound
		var handler = function () { selectAccount(idx); };
		GM_registerMenuCommand(caption, handler);
	}

	function renderAccountsPanel(editing) {
		$("a.edit.enter", selectionPanel).toggle(!editing);
		$("a.edit.exit", selectionPanel).toggle(editing);
	}

	function initAccountsPanel() {
		$("a.edit.enter", selectionPanel).on("click", function() { renderAccountsPanel(true)});
		$("a.edit.exit", selectionPanel).on("click", function() { renderAccountsPanel(false)});

		var rows;


		// Register event listeners in account table
		function registerEventListeners(editing) {
			var rows;
			if (!editing) {
				for (idx = 0; idx < accountsArray.length; idx++) {
					d.getElementById(idx).addEventListener('click', function() { selectAccount(this.id) }, false);
				}
			} else {
				rows = d.getElementById('accounts').getElementsByTagName('tr');
				for (idx = 1; idx < rows.length; idx++) {
					rows[idx].getElementsByTagName('a')[0].addEventListener('mouseover', buttonOver, false);
					rows[idx].getElementsByTagName('a')[0].addEventListener('mouseout',  buttonOut,  false);
					rows[idx].getElementsByTagName('a')[1].addEventListener('mouseover', buttonOver, false);
					rows[idx].getElementsByTagName('a')[1].addEventListener('mouseout',  buttonOut,  false);

					rows[idx].getElementsByTagName('a')[0].addEventListener('click', deleteAccount, false);
					rows[idx].getElementsByTagName('a')[1].addEventListener('click', addAccount,    false);
				}
			}
		}
	}

	function initialize() {
		// Load the defined custom styles
		GM_addStyle(stylesheet);

		initAccountsPanel(editing);
		// Insert the custom account selection panel
		$("#brt_content-section").prepend(selectionPanel);

		if (GMMenu) {
			for (idx = 0; idx < accountsArray.length; idx++) {
				addGMMenuItem(idx);
			}
		}

		// Want me to remove that puny original Rabobank 'remember my card' checkbox? It's bugged, and I just made it obsolete... Yeah, that's what I though :)
		if (removeOriginalRemember) {
			$('input[type="checkbox"]#brtcheck01').parent().hide();
		}

		// And for good measure, we may select the default/primary straight away.
		// This basically just fires the event listener function without setting the it's this.id attribute.
		if (autoFillDefault) {
			// We have to wait a little while to avoid conflict with Rabobank's native JavaScript ran on DOM-ready
			window.setTimeout(function() {
				selectAccount(defaultAccount);
				// The event handler doesn't check the radio button, so I'll do that here to give the user feedback
				d.getElementById(defaultAccount).checked = true;
			}, autoFillDelay);
		}
	}
	/**
	/* Run only script is of use, i.e.;
	/* if we're on a Rabobank page where we have the kind of form we can input something usefull into.
	 */
	if(
		$('#brt_form') !== null &&
		$('#AuthIdv4') !== null &&
		$('AuthBpasNrv4') !== null
	) {
		initialize();
	}

}());


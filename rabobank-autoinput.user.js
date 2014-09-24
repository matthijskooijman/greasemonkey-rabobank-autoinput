// ==UserScript==
// @name                Rabobank Internetbankieren auto-input
// @namespace           FelixAkk
// @description         Quickly select from multiple bank acccounts in the Rabobank login and payment pages
// @include             https://bankieren.rabobank.nl/klanten*
// @include             https://bankieren.rabobank.nl/rib/*
// @include             https://betalen.rabobank.nl/ide/qslo*
// @include             https://betalen.rabobank.nl/ideal-betaling/*
// @grant               GM_setValue
// @grant               GM_getValue
// @grant               GM_listValues
// @grant               GM_deleteValue
// @grant               GM_addStyle
// @grant               GM_registerMenuCommand
// @require             http://ajax.googleapis.com/ajax/libs/jquery/2.0.2/jquery.min.js
// @copyright           2014, Felix Akkermans
// @copyright           2014, Matthijs Kooijman (matthijs@stdin.nl)
// @license             The MIT license; http://opensource.org/licenses/MIT
// @homepageURL         https://github.com/matthijskooijman/greasemonkey-rabobank-autoinput
// @version             2.0.0
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
	'a.account.add, a.account.delete {'+
	'    background: no-repeat scroll 0 0 transparent;'+
	'    display: inline-block;'+
	'    height: 16px;'+
	'    opacity: 0.3;'+
	'    vertical-align: text-bottom;'+
	'    width: 16px;'+
	'}'+
	'a.account.add:hover, a.account.delete:hover {'+
	'    opacity: 1;'+
	'}'+
	'a.account.add {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/add.png");'+
	'}'+
	'a.account.delete {'+
	'    background-image: url("http://www.famfamfam.com/lab/icons/silk/icons/delete.png");'+
	'}';

	// Construct selection panel DOM
	var selectionPanel =
	// I'll employ the styles of the Rabobank CSS classes .imgstripe, .newpanel to make it look identical.
	'<div id="account_selection" class="imgstripe newpanel">'+
	'  <form>'+
	'    <table id="accounts">'+
	// Static table header
	'      <thead>'+
	'        <tr>'+
	'          <th>Selecteer uw Rabobank rekening</th>'+
	'          <th>Rekening nummer</th>'+
	'          <th>Kaart nummer</th>'+
	'        </tr>'+
	'      </thead>'+
	'      <tbody></tbody>'+
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

	// Utility function that takes a bank account number and returns it seperated by points like on the Rabobank cards
	function numberFormat(account) {
		var nr = String(account);
		return nr.substring(0, 4) + '.' + nr.substring(4, 6) + '.' + nr.substring(6);
	}

	// Build accounts table contents (the rows), depending on whether we're editing (true) or selecting (false)
	function constructTable() {
		var t = $('#accounts tbody');
		t.empty();
		for (var idx = 0; idx < accountsArray.length; idx++) {
			if (editing)
				t.append(constructEditableRow(accountsArray[idx]));
			else
				t.append(constructSelectableRow(idx, accountsArray[idx]));
		}
		if (editing)
			$('<tr><td colspan="4"><a href="#" class="account add"/></td></tr>').on('click', addAccount).appendTo(t);
	}

	function constructSelectableRow(idx, acc) {
		return $('<tr class="selectable-account"/>').append(
			$('<td/>').append(
				$('<input type="radio" name="account" />'),
				$('<label/>').text(acc.description)
			),
			$('<td/>').append($('<label/>').text(acc.number)),
			$('<td/>').append($('<label/>').text(acc.cardNumber))
		).on('click', function() { selectAccount(idx); });
	}

	function constructEditableRow(acc) {
		return $('<tr class="editable-account"/>').append(
			$('<td/>').append($('<input type="text" />').attr('value', acc.description)),
			$('<td/>').append($('<input type="text" size="9" maxlength="9"/>').attr('value', acc.number)),
			$('<td/>').append($('<input type="text" size="4" maxlength="4"/>').attr('value', acc.cardNumber)),
			$('<td/>').append($('<a href="#" class="account delete"/>').on('click', deleteAccount))
		);
	}

	function accountFromRow(row) {
		var inputs = $('input', row);
		return new Account(inputs[0].value, inputs[1].value, inputs[2].value);
	}

	// Define event handling function for selecting an account; fills in the account details
	function selectAccount(idx) {
		var d = document;
		$('#AuthIdv4').attr('value', accountsArray[idx].number);
		$('#AuthBpasNrv4').attr('value', accountsArray[idx].cardNumber);
		// Login pages have AuthCdv4, sign pages have SignCdv4.
		// Focuse whatever one is available.
		$('#AuthCdv4, #SignCdv4').focus();
		$('#accounts input[type="radio"]')[idx].checked = true;
	}

	// Define event handling function for deleting an account/row in the accounts table when editing accounts
	function deleteAccount() {
		$(this).closest('tr').remove();
	}

	// Define event handling function for inserting an account/row in the accounts table after a given index (when editing accounts)
	function addAccount(accountIdx) {
		var row = constructEditableRow(new Account());
		row.insertBefore($('#accounts tbody tr').last());
	}

	// Event handler for the save changes button
	function saveChanges() {
		accountsArray = []; // new array, clean slate
		// Fill array
		$('#accounts tbody tr').slice(0, -1).each(function(idx, row) {
			accountsArray.push(accountFromRow(row));
		});
		// Save it all
		GM_setValue('accountsJSON', JSON.stringify(accountsArray));
		setEditMode(false);
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

	function setEditMode(value) {
		// Update edit/save links
		$("a.edit.enter", selectionPanel).toggle(!value);
		$("a.edit.exit", selectionPanel).toggle(value);
		// Remember new edit mode
		editing = value;
		// Reconstruct table
		constructTable();
	}

	function initAccountsPanel() {
		$("a.edit.enter", selectionPanel).on("click", function() { setEditMode(true)});
		$("a.edit.exit", selectionPanel).on("click", function() { saveChanges()});
		setEditMode(false);
	}

	function initialize() {
		// Load the defined custom styles
		GM_addStyle(stylesheet);

		// Insert and fill the custom account selection panel
		$("#brt_content-section").prepend(selectionPanel);
		initAccountsPanel(editing);

		if (GMMenu) {
			for (var idx = 0; idx < accountsArray.length; idx++) {
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
			window.setTimeout(function() { selectAccount(defaultAccount); }, autoFillDelay);
		}
	}
	/**
	/* Run only when script is of use, i.e.;
	/* if we're on a Rabobank page where we have the kind of form we can input something usefull into.
	 */
	if(
		$('#brt_form') !== null &&
		$('#AuthIdv4') !== null &&
		$('#AuthBpasNrv4') !== null
	) {
		initialize();
	}

}());


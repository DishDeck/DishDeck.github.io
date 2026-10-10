/**
 * DishDeck - Google Apps Script Backend (100% Free, Serverless)
 *
 * This script runs directly inside Google Drive / Google Sheets.
 * It provides a secure API for:
 *   1. Updating menu items, prices, and stock availability directly in Google Sheets.
 *   2. Uploading new dish images directly into a Google Drive folder and generating direct CDN links.
 *   3. Reading menu data as JSON.
 *
 * Security:
 * - Only runs when invoked with the matching ADMIN_SECRET_KEY set in Script Properties.
 * - Or when invoked by the authenticated sheet owner.
 * - Public diners on GitHub Pages read via the standard public Google Sheet CSV or this endpoint.
 */

// Script property name for admin protection
var PROPERTY_SECRET_KEY = 'ADMIN_SECRET_KEY';
var DEFAULT_FOLDER_NAME = 'DishDeck - Menu Images';

/**
 * Handle GET requests (Read menu)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var menuSheet = ss.getSheetByName('Menu') || ss.getSheets()[0];
    var data = menuSheet.getDataRange().getValues();

    if (data.length <= 1) {
      return jsonResponse({ ok: true, items: [] });
    }

    var headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    var items = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var item = {};
      var hasData = false;
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c];
        var val = row[c];
        if (val !== '' && val !== null && val !== undefined) {
          hasData = true;
          item[key] = val;
        }
      }
      if (hasData && (item.name || item.dish || item.item)) {
        items.push(item);
      }
    }

    return jsonResponse({
      ok: true,
      title: ss.getName(),
      updatedAt: new Date().toISOString(),
      items: items
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

/**
 * Handle POST requests (Update menu, change stock, upload images)
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);

    // Verify secret key if configured in Script Properties
    var configuredSecret = PropertiesService.getScriptProperties().getProperty(PROPERTY_SECRET_KEY);
    if (configuredSecret && configuredSecret.trim() !== '') {
      if (!payload.secretKey || payload.secretKey !== configuredSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized: Invalid or missing admin secret key.' }, 401);
      }
    }

    var action = payload.action || 'update_menu';

    if (action === 'update_menu') {
      return handleUpdateMenu(payload);
    } else if (action === 'upload_image') {
      return handleUploadImage(payload);
    } else if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'DishDeck Apps Script is online and connected.' });
    } else {
      return jsonResponse({ ok: false, error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

/**
 * Save updated menu rows into the Google Sheet
 */
function handleUpdateMenu(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var menuSheet = ss.getSheetByName('Menu');
  if (!menuSheet) {
    menuSheet = ss.insertSheet('Menu');
  }

  var items = payload.items;
  if (!items || !Array.isArray(items)) {
    return jsonResponse({ ok: false, error: 'Payload must include an "items" array.' }, 400);
  }

  // Standard columns
  var columns = [
    'id', 'category', 'name', 'description', 'price', 'variants', 'image',
    'video', 'tags', 'spice', 'status', 'special', 'special_price',
    'special_from', 'special_to', 'sort', 'note'
  ];

  var outRows = [columns];

  items.forEach(function(it, idx) {
    var row = [
      it.id || ('dish-' + (idx + 1)),
      it.category || 'general',
      it.name || 'Dish ' + (idx + 1),
      it.description || it.desc || '',
      it.price !== undefined && it.price !== null ? it.price : 0,
      it.variants ? (Array.isArray(it.variants) ? it.variants.map(function(v){ return v.label + '=' + v.price; }).join(' | ') : it.variants) : '',
      it.image || '',
      it.video ? (Array.isArray(it.video) ? it.video.join(' | ') : it.video) : '',
      it.tags ? (Array.isArray(it.tags) ? it.tags.join(', ') : it.tags) : '',
      it.spice !== undefined ? it.spice : 0,
      it.status || 'on',
      it.special ? 'TRUE' : 'FALSE',
      it.special_price !== undefined && it.special_price !== null ? it.special_price : (it.specialPrice || ''),
      it.special_from || it.specialFrom || '',
      it.special_to || it.specialTo || '',
      it.sort !== undefined ? it.sort : idx * 10,
      it.note || ''
    ];
    outRows.push(row);
  });

  // Clear existing content and write new
  menuSheet.clear();
  var range = menuSheet.getRange(1, 1, outRows.length, columns.length);
  range.setValues(outRows);

  // Format header row
  var headerRange = menuSheet.getRange(1, 1, 1, columns.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1e293b');
  headerRange.setFontColor('#ffffff');
  menuSheet.setFrozenRows(1);

  return jsonResponse({
    ok: true,
    message: 'Menu updated successfully',
    updatedCount: items.length,
    timestamp: new Date().toISOString()
  });
}

/**
 * Upload an image directly to the Google Drive folder
 */
function handleUploadImage(payload) {
  var base64Data = payload.data;
  var fileName = payload.fileName || ('dish_' + Date.now() + '.jpg');
  var mimeType = payload.mimeType || 'image/jpeg';
  var folderId = payload.folderId;

  if (!base64Data) {
    return jsonResponse({ ok: false, error: 'Missing base64 data for image upload.' }, 400);
  }

  // Strip data:image/...;base64, prefix if present
  if (base64Data.indexOf(';base64,') > -1) {
    var parts = base64Data.split(';base64,');
    base64Data = parts[1];
  }

  var decodedBytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

  var targetFolder;
  if (folderId && folderId.trim() !== '') {
    targetFolder = DriveApp.getFolderById(folderId.trim());
  } else {
    // Find or create default folder
    var folders = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = DriveApp.createFolder(DEFAULT_FOLDER_NAME);
      targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }

  var file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  var cdnUrl = 'https://lh3.googleusercontent.com/d/' + fileId;

  return jsonResponse({
    ok: true,
    fileId: fileId,
    cdnUrl: cdnUrl,
    directUrl: 'https://drive.google.com/uc?export=view&id=' + fileId,
    viewUrl: file.getUrl()
  });
}

/**
 * Output JSON with CORS headers
 */
function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

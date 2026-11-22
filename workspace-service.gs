/** Authenticate before touching Sheets or Drive. The legacy handlers retain their locks. */
function workspaceRequest_(request) {
  function reply(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    if (request.loginToken) ledgerLoginAuth_(request.loginToken);
    else ledgerDeviceAuth_(request.deviceToken);

    const input = request.payload;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('คำขอไม่ถูกต้อง');
    const tab = input.sheetName || 'Data Account';
    const jobTabs = ['Data Account', 'Chokdee', 'Print Jobs'];
    const action = request.operation;
    if (['jobList', 'jobSave', 'jobDelete', 'jobImage'].includes(action) && !jobTabs.includes(tab)) {
      throw Error('ไม่พบชีตรายการงาน');
    }
    switch (action) {
      case 'session': return reply({ok:true});
      case 'jobList': return workspaceLegacyGet_({parameter:{action:'list',sheetName:tab}});
      case 'jobSave':
      case 'jobDelete': {
        const data = {...input, sheetName:tab, action:action === 'jobDelete' ? 'delete' : 'save'};
        return workspaceLegacyPost_({postData:{contents:JSON.stringify(data)}});
      }
      case 'jobImage': {
        if (typeof input.id !== 'string' || !input.id) throw Error('ไม่พบรูปงาน');
        const sheet = getSheet_(tab), row = findRowById_(sheet,input.id);
        if (!row || sheet.getLastColumn() < 31) throw Error('ไม่พบรูปงาน');
        const image = JSON.parse(sheet.getRange(row,31).getValue() || 'null');
        const folder = PropertiesService.getScriptProperties().getProperty('PRINT_OS_JOB_IMAGES_FOLDER');
        if (!image?.fileId || !folder) throw Error('ไม่พบรูปงาน');
        const file = DriveApp.getFileById(image.fileId), parents = file.getParents();
        let inWorkspace = false;
        while (parents.hasNext()) if (parents.next().getId() === folder) inWorkspace = true;
        if (!inWorkspace || file.getSize() > 700*1024) throw Error('ไม่พบรูปงาน');
        const blob = file.getBlob(), mime = blob.getContentType();
        if (!['image/webp','image/jpeg','image/png'].includes(mime)) throw Error('ชนิดรูปงานไม่ถูกต้อง');
        return reply({ok:true,dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(blob.getBytes())});
      }
      case 'paymentChannelsGet':
        return reply(orPaymentChannelAction_({action:'getPaymentChannels',store:input.store,revision:input.revision}));
      case 'profileGet': return workspaceLegacyGet_({parameter:{action:'profile'}});
      case 'vaultGet': return workspaceLegacyGet_({parameter:{action:'vaultLoad',sheetName:'SecureVault',id:String(input.id||'')}});
      case 'profileSave':
      case 'vaultSave':
      case 'vaultBackupDrive': {
        const data = {...input, action:action === 'profileSave' ? 'saveProfile' : action};
        if (action !== 'profileSave') data.sheetName = 'SecureVault';
        if (action === 'vaultBackupDrive') data.folderName = 'Secure Vault Backups';
        return workspaceLegacyPost_({postData:{contents:JSON.stringify(data)}});
      }
      default: throw Error('คำขอไม่ถูกต้อง');
    }
  } catch (error) {
    const code = String(error.message || '');
    const loginExpired = code === 'LOGIN_EXPIRED';
    const needsPair = code === 'DEVICE_REQUIRED' || code === 'DEVICE_REVOKED';
    return reply({ok:false,loginExpired,needsPair,error:loginExpired||needsPair?'กรุณายืนยันตัวตนก่อนเปิดหรือแก้ไขข้อมูล':code});
  }
}

function doPost(e) {
  const data = parsePayload_(e);
  if (data.action === 'ledgerDevice' && data.command === 'workspace') return workspaceRequest_(data);
  if (data.action === 'ledgerDevice' || data.action === 'outstandingBridge') return workspaceLegacyPost_(e);
  return ContentService.createTextOutput(JSON.stringify({ok:false,needsPair:true,error:'กรุณายืนยันตัวตนก่อนเปิดหรือแก้ไขข้อมูล'})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = e?.parameter?.action;
  if (action === 'outstandingOwner' || action === 'ledgerLoginProbe') {
    try {
      orRequireOwner_();
      return workspaceLegacyGet_(e);
    } catch (error) {
      return ContentService.createTextOutput(error.message);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,needsPair:true,error:'กรุณายืนยันตัวตนก่อนเปิดหรือแก้ไขข้อมูล'})).setMimeType(ContentService.MimeType.JSON);
}

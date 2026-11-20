/* The server verifies each operation; this dialog keeps job screens locked until a session opens. */
const WorkspaceAccess = (() => {
  let dialog, message, unlock;
  function lock(error) {
    if (!dialog) return;
    message.textContent = error?.message || 'ลงชื่อเข้าใช้ด้วยบัญชี Google เจ้าของร้าน หรือใช้อุปกรณ์ที่จับคู่ไว้';
    if (!dialog.open) dialog.showModal();
  }
  async function call(operation, payload = {}) {
    try {
      return await AccountsCloud.workspace(operation, payload);
    } catch (error) {
      if (error.needsPair) lock(error);
      throw error;
    }
  }
  function mount(onReady) {
    unlock = onReady;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby','workspace-access-heading');
    dialog.innerHTML = '<h2 id="workspace-access-heading">ยืนยันตัวตนก่อนเปิดรายการงาน</h2><p role="status"></p><button type="button">ยืนยันบัญชี Google</button> <a href="accounts.html">ตั้งค่าอุปกรณ์</a>';
    dialog.addEventListener('cancel', event => event.preventDefault());
    document.body.append(dialog);
    message = dialog.querySelector('[role=status]');
    const button = dialog.querySelector('button');
    const check = async (interactive) => {
      button.disabled = true;
      try {
        if (interactive) await AccountsCloud.loginGoogle();
        await call('session');
        dialog.close();
        unlock();
      } catch (error) {
        lock(error);
      } finally {
        button.disabled = false;
      }
    };
    button.onclick = () => void check(true);
    lock();
    void check(false);
  }
  return {call,mount};
})();

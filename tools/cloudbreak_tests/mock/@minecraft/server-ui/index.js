// Forms record what they were given; set ActionFormData.nextSelection to "tap" a button.
export const shown = [];
export class ActionFormData {
  constructor() { this._title = ""; this._body = ""; this._buttons = []; }
  title(t) { this._title = t; return this; }
  body(b) { this._body = b; return this; }
  button(text, icon) { this._buttons.push({ text, icon }); return this; }
  async show() {
    shown.push(this);
    const sel = ActionFormData.queue.shift();
    return sel === undefined ? { canceled: true } : { canceled: false, selection: sel };
  }
}
ActionFormData.queue = [];
export class ModalFormData {} export class MessageFormData { title(){return this;} body(){return this;} button1(){return this;} button2(){return this;} async show(){ shown.push(this); return { canceled: true }; } }
export const FormCancelationReason = { UserBusy: 'UserBusy' };

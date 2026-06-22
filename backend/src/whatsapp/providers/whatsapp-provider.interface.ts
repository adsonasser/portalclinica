export interface QrCodeResult {
  qrcode: string | null;
  code?: string | null;
  status: string;
}

export interface StatusResult {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface SendResult {
  messageId?: string;
  status: string;
}

export interface IWhatsAppProvider {
  connect(clinicId: string, integration: any): Promise<QrCodeResult>;
  getConnectionStatus(clinicId: string, integration: any): Promise<StatusResult>;
  disconnect(clinicId: string, integration: any): Promise<void>;
  sendTextMessage(clinicId: string, integration: any, phone: string, text: string): Promise<SendResult>;
}

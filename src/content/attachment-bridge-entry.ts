import { installAttachmentBridge } from "./attachment-bridge";

const installationKey = "__gopasteAttachmentBridge";
const host = window as Window & { [installationKey]?: () => void };

host[installationKey]?.();
const cleanup = installAttachmentBridge();
host[installationKey] = () => {
  cleanup();
  if (host[installationKey]) delete host[installationKey];
};

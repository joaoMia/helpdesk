export function privateAttachmentHeaders(
  file: { name: string; mime: string },
  preview: boolean,
) {
  const inline = preview && file.mime === 'image/png';
  const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? '';
  const name = encodeURIComponent(file.name).replace(
    /[!'()*]/g,
    (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
  );
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Content-Type': file.mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="arquivo${extension}"; filename*=UTF-8''${name}`,
  };
}

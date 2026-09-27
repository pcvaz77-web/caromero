export type WhatsAppTransport = {baseUrl:string,token:string,provider:'meta'|'dualhook'}

export function whatsappTransport(env:(name:string)=>string|undefined):WhatsAppTransport|null {
  const provider=env('WHATSAPP_API_PROVIDER') || 'meta'
  if (provider!=='meta' && provider!=='dualhook') return null
  const version=env('META_WHATSAPP_GRAPH_VERSION') || ''
  if (!/^v\d+\.\d+$/.test(version)) return null
  if (provider==='dualhook' && version!=='v25.0') return null
  const token=provider==='dualhook' ? env('DUALHOOK_API_KEY') : env('META_WHATSAPP_ACCESS_TOKEN')
  if (!token) return null
  return {
    baseUrl:`https://${provider==='dualhook'?'api.dualhook.com':'graph.facebook.com'}/${version}`,
    token,provider
  }
}

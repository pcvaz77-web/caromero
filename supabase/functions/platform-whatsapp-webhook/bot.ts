export type BotSettings = {
  enabled:boolean,
  greeting:string,
  link1_label:string, link1_url:string,
  link2_label:string, link2_url:string,
  attendant_label:string
}

export type BotAction = 'menu'|'link1'|'link2'|'attendant'|'optout'|'ignored'

export function validSettings(value:any):value is BotSettings {
  const label=(text:any)=>typeof text==='string' && text.trim().length>0 && text.length<=20
  const link=(text:any)=>{
    if (typeof text!=='string' || text.length>500) return false
    try {
      const url=new URL(text)
      return url.protocol==='https:' && !!url.hostname && !url.username && !url.password
    } catch { return false }
  }
  return value?.enabled===true && typeof value.greeting==='string' &&
    value.greeting.length>=10 && value.greeting.length<=900 &&
    label(value.link1_label) && label(value.link2_label) && label(value.attendant_label) &&
    link(value.link1_url) && link(value.link2_url)
}

export function selectedAction(message:any):BotAction|null {
  const id=String(message?.interactive?.button_reply?.id||message?.button?.payload||'')
  if (id==='carometro_menu') return 'menu'
  if (id==='carometro_link1' || id==='carometro_link2' || id==='carometro_attendant')
    return id==='carometro_link1'?'link1':id==='carometro_link2'?'link2':'attendant'
  const text=String(message?.text?.body||message?.button?.text||'').trim().toLocaleUpperCase('pt-BR')
  if (['SAIR','PARAR'].includes(text)) return 'optout'
  if (text==='1') return 'link1'
  if (text==='2') return 'link2'
  if (text==='3' || text==='ATENDIMENTO' || text==='ATENDENTE') return 'attendant'
  return null
}

export function decideAction(message:any,session:any,now:number):BotAction {
  const explicit=selectedAction(message)
  if (explicit) return explicit
  const handoff=Date.parse(session?.handoff_until||'')>now
  const recentMenu=Date.parse(session?.last_menu_at||'')>now-24*60*60*1000
  return handoff || recentMenu?'ignored':'menu'
}

export function menuMessage(settings:BotSettings,to:string) {
  return {messaging_product:'whatsapp',to,type:'interactive',interactive:{
    type:'button',body:{text:settings.greeting},action:{buttons:[
      {type:'reply',reply:{id:'carometro_link1',title:settings.link1_label}},
      {type:'reply',reply:{id:'carometro_link2',title:settings.link2_label}},
      {type:'reply',reply:{id:'carometro_attendant',title:settings.attendant_label}}
    ]}
  }}
}

export function linkMessage(settings:BotSettings,to:string,action:'link1'|'link2') {
  const label=action==='link1'?settings.link1_label:settings.link2_label
  const url=action==='link1'?settings.link1_url:settings.link2_url
  return {messaging_product:'whatsapp',to,type:'interactive',interactive:{
    type:'cta_url',body:{text:`${label}: toque no botão abaixo para abrir a página.`},
    action:{name:'cta_url',parameters:{display_text:label,url}}
  }}
}

export function textMessage(to:string,text:string) {
  return {messaging_product:'whatsapp',to,type:'text',text:{body:text}}
}

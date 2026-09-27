export type Template = {name:string,language:string,category:string,status:string,components:any[]}
export type Campaign = {id:string,message_body:string,video_url:string|null,cover_url:string|null,
  target_roles:string[],target_school_id:string|null,status:string}

export const bodyText = (template:Template) => String(template.components.find(c=>c.type==='BODY')?.text ?? '')

export function supported(template:Template) {
  const body = bodyText(template)
  if (!body.includes('{{1}}') || /\{\{(?!1\}\})\d+\}\}/.test(body)) return false
  const headers = template.components.filter(c=>c.type==='HEADER')
  if (headers.some(c=>c.format!=='IMAGE')) return false
  const buttons = template.components.find(c=>c.type==='BUTTONS')?.buttons ?? []
  if (buttons.some((b:any)=>b.type==='URL' && /\{\{/.test(b.url ?? '') && !/\{\{1\}\}$/.test(b.url ?? ''))) return false
  return true
}

export function componentsFor(template:Template,campaign:Campaign,buttonLinks:Record<string,string>={}) {
  if (!supported(template) || campaign.message_body.length > 500) throw new Error('template_not_compatible')
  const components:any[] = []
  const header = template.components.find(c=>c.type==='HEADER')
  if (!header && campaign.cover_url) throw new Error('template_has_no_image_header')
  if (header) {
    if (!campaign.cover_url || !/^https:\/\//.test(campaign.cover_url)) throw new Error('image_required')
    components.push({type:'header',parameters:[{type:'image',image:{link:campaign.cover_url}}]})
  }
  components.push({type:'body',parameters:[{type:'text',text:campaign.message_body}]})
  const buttons = template.components.find(c=>c.type==='BUTTONS')?.buttons ?? []
  const dynamicIndexes=buttons.map((b:any,index:number)=>b.type==='URL' && /\{\{1\}\}$/.test(b.url ?? '')?index:-1).filter((index:number)=>index>=0)
  for (const index of dynamicIndexes) {
    const prefix = String(buttons[index].url).slice(0,-5)
    const destination = buttonLinks[String(index)] || (index===dynamicIndexes[0] ? campaign.video_url : null)
    if (!destination?.startsWith(prefix) || destination.length <= prefix.length || !prefix.startsWith('https://'))
      throw new Error('link_does_not_match_template')
    components.push({type:'button',sub_type:'url',index:String(index),parameters:[
      {type:'text',text:destination.slice(prefix.length)}
    ]})
  }
  for (const [index,button] of buttons.entries()) if (button.type==='QUICK_REPLY') {
    components.push({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{
      type:'payload',payload:/atend/i.test(String(button.text||''))?'carometro_attendant':'carometro_menu'
    }]})
  }
  if (!dynamicIndexes.length && campaign.video_url && !buttons.some((b:any)=>b.type==='URL' && b.url===campaign.video_url)) {
    throw new Error('template_has_no_matching_link')
  }
  return components
}

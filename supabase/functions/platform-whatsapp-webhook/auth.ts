export function validOverrideKey(url:string,configured:string) {
  if (configured.length<32) return false
  const supplied=new URL(url).searchParams.get('key') ?? ''
  if (supplied.length!==configured.length) return false
  let difference=0
  for (let index=0;index<configured.length;index++)
    difference|=supplied.charCodeAt(index)^configured.charCodeAt(index)
  return difference===0
}

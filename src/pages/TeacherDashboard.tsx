import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Building2, CalendarClock, Camera, Download, Fingerprint, LoaderCircle, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react'
import { captureDescriptor } from '../services/camera'
import { supabase } from '../lib/supabase'
import { apiPost } from '../services/api'

type Student = { id: string; student_code: string; full_name: string; status: string; created_at: string }
type Lab = { id: string; name: string; location: string | null; status: string }
type Template = { id: string; student_id: string; student_name: string; student_code: string; created_at: string; model_version: string }
type Log = { id: string; result: string; reason: string; created_at: string; students?: { full_name: string; student_code: string } | null; laboratories?: { name: string } | null }
type Permission = { id: string; student_id: string; laboratory_id: string; valid_from: string; valid_until: string; allowed_days: number; start_time: string; end_time: string; status: string }
type Tab = 'overview'|'students'|'labs'|'permissions'|'biometrics'|'logs'
const CONSENT_VERSION = 'FG-UCT-2026-01'

export default function TeacherDashboard({ onBack, onSignOut, teacherName, initialTab='overview' }: { onBack: () => void; onSignOut: () => Promise<void>; teacherName: string; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [students, setStudents] = useState<Student[]>([])
  const [labs, setLabs] = useState<Lab[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [studentCode, setStudentCode] = useState('')
  const [studentName, setStudentName] = useState('')
  const [labName, setLabName] = useState('')
  const [labLocation, setLabLocation] = useState('')
  const [permissionStudent, setPermissionStudent] = useState('')
  const [permissionLab, setPermissionLab] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0,10))
  const [validUntil, setValidUntil] = useState(new Date(Date.now()+90*86400000).toISOString().slice(0,10))
  const [days, setDays] = useState(31)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [enrollStudent, setEnrollStudent] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [capturePrompt, setCapturePrompt] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const cameraStream = useRef<MediaStream | null>(null)

  const loadData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [studentRows, labRows, permissionRows, logRows, templateResult] = await Promise.all([
      supabase.from('students').select('id,student_code,full_name,status,created_at').order('full_name'),
      supabase.from('laboratories').select('id,name,location,status').order('name'),
      supabase.from('access_permissions').select('*').order('valid_from',{ascending:false}),
      supabase.from('access_logs').select('id,result,reason,created_at,students(full_name,student_code),laboratories(name)').order('created_at',{ascending:false}).limit(100),
      apiPost<{templates:Template[]}>('/api/manage-templates',{action:'list'}).then(data=>({data,error:null})).catch(error=>({data:null,error})),
    ])
    const err = studentRows.error ?? labRows.error ?? permissionRows.error ?? logRows.error
    if (err) setNotice(err.message)
    setStudents(studentRows.data ?? []); setLabs(labRows.data ?? []); setPermissions(permissionRows.data ?? []); setLogs((logRows.data ?? []) as unknown as Log[])
    if (templateResult.error) setNotice(templateResult.error.message)
    if (!templateResult.error && Array.isArray(templateResult.data?.templates)) setTemplates(templateResult.data.templates)
    setLoading(false)
  }, [])
  useEffect(() => { void loadData(); return () => cameraStream.current?.getTracks().forEach(track => track.stop()) }, [loadData])

  async function addStudent(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setNotice('')
    const { error } = await supabase.from('students').insert({ student_code: studentCode.trim(), full_name: studentName.trim(), status: 'active' })
    setBusy(false)
    if (error) setNotice(error.code === '23505' ? 'Ese código universitario ya está registrado.' : error.message)
    else { setStudentCode(''); setStudentName(''); setNotice('Estudiante agregado. Para registrar su plantilla, abre Biometría y captura con consentimiento.'); await loadData() }
  }
  async function addLab(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return
    setBusy(true); const { error } = await supabase.from('laboratories').insert({ name: labName.trim(), location: labLocation.trim() || null, status: 'active' }); setBusy(false)
    if (error) setNotice(error.code === '23505' ? 'Ya existe un laboratorio con ese nombre.' : error.message)
    else { setLabName(''); setLabLocation(''); setNotice('Laboratorio creado.'); await loadData() }
  }
  async function removeLab(lab: Lab) {
    if (!supabase || !confirm(`¿Desactivar el laboratorio “${lab.name}”?`)) return
    const { error } = await supabase.from('laboratories').update({ status: 'inactive' }).eq('id',lab.id)
    setNotice(error?.message ?? 'Laboratorio desactivado.'); await loadData()
  }
  async function addPermission(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return
    if (!permissionStudent || !permissionLab || validUntil < validFrom || endTime <= startTime) { setNotice('Revisa estudiante, laboratorio, fechas y horario.'); return }
    setBusy(true); const { error } = await supabase.from('access_permissions').insert({ student_id: permissionStudent, laboratory_id: permissionLab, valid_from: validFrom, valid_until: validUntil, allowed_days: days, start_time: startTime, end_time: endTime, status: 'active' }); setBusy(false)
    if (error) setNotice(error.message); else { setNotice('Permiso asignado.'); await loadData() }
  }
  async function revokePermission(permission: Permission) {
    if (!supabase || !confirm('¿Revocar este permiso?')) return
    const { error } = await supabase.from('access_permissions').update({ status:'revoked' }).eq('id',permission.id)
    setNotice(error?.message ?? 'Permiso revocado.'); await loadData()
  }
  async function deleteStudent(student: Student) {
    if (!supabase || !confirm(`Se eliminarán ${student.full_name}, sus permisos, consentimiento y plantillas. ¿Continuar?`)) return
    const { error } = await supabase.from('students').delete().eq('id',student.id)
    setNotice(error?.message ?? 'Estudiante y sus datos asociados eliminados.'); await loadData()
  }
  async function revokeTemplate(template: Template) {
    if (!supabase || !confirm(`¿Eliminar la plantilla biométrica de ${template.student_name}? Esta acción no se puede deshacer.`)) return
    try { await apiPost('/api/manage-templates',{action:'delete',template_id:template.id}); setNotice('Plantilla eliminada.') }
    catch(error) { setNotice(error instanceof Error?error.message:'No se pudo eliminar la plantilla.') }
    await loadData()
  }
  async function beginEnrollment() {
    if (!supabase || !enrollStudent) { setNotice('Selecciona un estudiante.'); return }
    if (!consentAccepted) { setNotice('Lee el consentimiento y confirma la aceptación voluntaria del estudiante.'); return }
    try {
      cameraStream.current = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})
      setCaptureOpen(true); setCapturePrompt('Centra el rostro, mira a la cámara y mantente quieto.');
      window.setTimeout(() => { if (video.current && cameraStream.current) { video.current.srcObject = cameraStream.current; void video.current.play() } },0)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo iniciar la cámara.') }
  }
  async function captureAndEnroll() {
    if (!video.current || !supabase || !enrollStudent) return
    setBusy(true); setCapturePrompt('Capturando tres muestras válidas… no muevas el rostro.')
    try {
      const samples: number[][] = []
      for (let i=0;i<3;i++) { await new Promise(resolve => setTimeout(resolve,450)); samples.push(await captureDescriptor(video.current)) }
      setCapturePrompt('Cifrando y guardando las plantillas en el servidor…')
      const data = await apiPost<{duplicate_warning?:boolean}>('/api/enroll-template',{student_id:enrollStudent,samples,consent_version:CONSENT_VERSION,consent_accepted:true,model_version:'faceapi-tiny-128-v1'})
      setNotice(data?.duplicate_warning ? 'Registro guardado. Atención: se encontraron posibles similitudes; requiere revisión docente.' : 'Plantilla biométrica registrada y cifrada correctamente.')
      setCaptureOpen(false); setConsentAccepted(false); await loadData()
    } catch(error) { setCapturePrompt(error instanceof Error ? error.message : 'No se pudo completar el registro.') }
    finally { setBusy(false); cameraStream.current?.getTracks().forEach(track=>track.stop()); cameraStream.current=null }
  }
  function cancelCapture() { cameraStream.current?.getTracks().forEach(track=>track.stop()); cameraStream.current=null; setCaptureOpen(false); setBusy(false) }
  function exportCsv() {
    const quote=(value:string)=>`"${value.replaceAll('"','""')}"`
    const rows=[['fecha','resultado','estudiante','código','laboratorio','motivo'],...logs.map(log=>[log.created_at,log.result,log.students?.full_name??'No identificado',log.students?.student_code??'',log.laboratories?.name??'',log.reason])]
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(v=>quote(String(v))).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='faceguard-accesos.csv'; link.click(); URL.revokeObjectURL(url)
  }
  const shownStudents=students.filter(student=>`${student.full_name} ${student.student_code}`.toLowerCase().includes(search.toLowerCase()))
  const tabs: {id:Tab; label:string; icon:React.ReactNode}[]=[{id:'overview',label:'Resumen',icon:<Activity size={17}/>},{id:'students',label:'Estudiantes',icon:<Users size={17}/>},{id:'labs',label:'Laboratorios',icon:<Building2 size={17}/>},{id:'permissions',label:'Permisos',icon:<CalendarClock size={17}/>},{id:'biometrics',label:'Biometría',icon:<Fingerprint size={17}/>},{id:'logs',label:'Historial',icon:<ShieldCheck size={17}/> }]
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-[#071b35] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-blue-950"><Fingerprint/></div><div><b className="text-lg">FACEGUARD <span className="text-cyan-300">UCT</span></b><p className="text-xs text-blue-200">Panel docente · {teacherName}</p></div></div><div className="flex gap-2"><button onClick={onBack} className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">Ver escáner</button><button onClick={()=>void onSignOut()} className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-100 hover:bg-rose-500/30">Cerrar sesión</button></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-7 md:px-8"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Administración segura</p><h1 className="mt-1 text-3xl font-black">Panel docente</h1><p className="mt-1 text-sm text-slate-500">Gestiona laboratorios, estudiantes, permisos y registros biométricos.</p></div><button onClick={()=>void loadData()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Actualizar datos</button></div>
      {notice && <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Cerrar aviso">×</button></div>}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{tabs.map(item=><button key={item.id} onClick={()=>setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab===item.id?'bg-blue-700 text-white':'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>{item.icon}{item.label}</button>)}</div>
      {loading ? <div className="flex items-center gap-2 p-10 text-slate-500"><LoaderCircle className="animate-spin"/>Cargando datos protegidos…</div> : <>
      {tab==='overview' && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Estudiantes" value={students.length} icon={<Users/>}/><Metric title="Laboratorios activos" value={labs.filter(l=>l.status==='active').length} icon={<Building2/>}/><Metric title="Plantillas inscritas" value={templates.length} icon={<Fingerprint/>}/><Metric title="Accesos recientes" value={logs.length} icon={<Activity/>}/></div><Panel title="Actividad reciente"><LogTable logs={logs.slice(0,8)}/></Panel><p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">El PAD no está implementado; las coincidencias faciales requieren confirmación presencial docente y nunca abren una cerradura.</p></>}
      {tab==='students' && <><Panel title="Agregar estudiante"><form onSubmit={addStudent} className="grid gap-3 sm:grid-cols-3"><Field label="Código universitario"><input required minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+" value={studentCode} onChange={e=>setStudentCode(e.target.value)} className={input}/></Field><Field label="Nombre completo"><input required minLength={2} maxLength={160} value={studentName} onChange={e=>setStudentName(e.target.value)} className={input}/></Field><button disabled={busy} className={submit}><Plus size={17}/>Agregar estudiante</button></form></Panel><Panel title="Estudiantes registrados"><div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={17} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o código" className="w-full py-2 outline-none"/></div><div className="table-wrap"><table><thead><tr><th>Código</th><th>Estudiante</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{shownStudents.map(s=><tr key={s.id}><td>{s.student_code}</td><td>{s.full_name}</td><td>{s.status}</td><td><button onClick={()=>void deleteStudent(s)} className="text-rose-700" title="Eliminar estudiante"><Trash2 size={17}/></button></td></tr>)}</tbody></table>{!shownStudents.length&&<Empty>No hay estudiantes con ese filtro.</Empty>}</div></Panel></>}
      {tab==='labs' && <><Panel title="Crear laboratorio"><form onSubmit={addLab} className="grid gap-3 sm:grid-cols-3"><Field label="Nombre"><input required maxLength={120} value={labName} onChange={e=>setLabName(e.target.value)} className={input}/></Field><Field label="Ubicación"><input maxLength={200} value={labLocation} onChange={e=>setLabLocation(e.target.value)} className={input}/></Field><button disabled={busy} className={submit}><Plus size={17}/>Crear laboratorio</button></form></Panel><Panel title="Laboratorios"><div className="table-wrap"><table><thead><tr><th>Laboratorio</th><th>Ubicación</th><th>Estado</th><th></th></tr></thead><tbody>{labs.map(l=><tr key={l.id}><td>{l.name}</td><td>{l.location||'—'}</td><td>{l.status}</td><td>{l.status==='active'&&<button onClick={()=>void removeLab(l)} className="text-rose-700" title="Desactivar"><Trash2 size={17}/></button>}</td></tr>)}</tbody></table>{!labs.length&&<Empty>Agrega tu primer laboratorio.</Empty>}</div></Panel></>}
      {tab==='permissions' && <><Panel title="Asignar permiso"><form onSubmit={addPermission} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Estudiante"><select required value={permissionStudent} onChange={e=>setPermissionStudent(e.target.value)} className={input}><option value="">Seleccionar…</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.student_code}</option>)}</select></Field><Field label="Laboratorio"><select required value={permissionLab} onChange={e=>setPermissionLab(e.target.value)} className={input}><option value="">Seleccionar…</option>{labs.filter(l=>l.status==='active').map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><Field label="Válido desde"><input type="date" required value={validFrom} onChange={e=>setValidFrom(e.target.value)} className={input}/></Field><Field label="Válido hasta"><input type="date" required value={validUntil} onChange={e=>setValidUntil(e.target.value)} className={input}/></Field><Field label="Días"><select value={days} onChange={e=>setDays(Number(e.target.value))} className={input}><option value={127}>Todos</option><option value={31}>Lunes a viernes</option><option value={1}>Lunes</option><option value={2}>Martes</option><option value={4}>Miércoles</option><option value={8}>Jueves</option><option value={16}>Viernes</option><option value={32}>Sábado</option><option value={64}>Domingo</option></select></Field><Field label="Desde"><input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)} className={input}/></Field><Field label="Hasta"><input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)} className={input}/></Field><button disabled={busy} className={submit}><Plus size={17}/>Guardar permiso</button></form><p className="mt-3 text-xs text-slate-500">Los horarios se validan según la hora local de Perú. No se admiten rangos que crucen medianoche.</p></Panel><Panel title="Permisos actuales"><div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Laboratorio</th><th>Vigencia</th><th>Horario</th><th>Estado</th><th></th></tr></thead><tbody>{permissions.map(p=><tr key={p.id}><td>{students.find(s=>s.id===p.student_id)?.full_name??'—'}</td><td>{labs.find(l=>l.id===p.laboratory_id)?.name??'—'}</td><td>{p.valid_from} – {p.valid_until}</td><td>{p.start_time.slice(0,5)}–{p.end_time.slice(0,5)} · {daysLabel(p.allowed_days)}</td><td>{p.status}</td><td>{p.status==='active'&&<button onClick={()=>void revokePermission(p)} className="text-rose-700">Revocar</button>}</td></tr>)}</tbody></table>{!permissions.length&&<Empty>Sin permisos asignados.</Empty>}</div></Panel></>}
      {tab==='biometrics' && <><Panel title="Registro biométrico supervisado"><div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950"><b>Consentimiento informado · versión {CONSENT_VERSION}</b><p className="mt-1">El estudiante acepta voluntariamente que se genere un descriptor facial para la verificación de acceso a laboratorios de FACEGUARD UCT. No se guardan fotos o videos. El descriptor se cifra en servidor; puede revocar su consentimiento y solicitar eliminación. La biometría es opcional y existe verificación manual alternativa. El prototipo no garantiza detección de fotos o videos y no controla cerraduras.</p></div><Field label="Estudiante (registrado previamente)"><select value={enrollStudent} onChange={e=>setEnrollStudent(e.target.value)} className={input}><option value="">Seleccionar estudiante…</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.student_code}</option>)}</select></Field><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={consentAccepted} onChange={e=>setConsentAccepted(e.target.checked)} className="mt-1"/><span>Confirmo como profesor que el estudiante recibió y aceptó libremente el consentimiento informado y puede solicitar la eliminación de su plantilla.</span></label><button onClick={()=>void beginEnrollment()} disabled={!enrollStudent||!consentAccepted||busy} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50"><span className="inline-flex items-center gap-2"><Camera size={18}/>Iniciar captura de tres muestras</span></button></Panel><Panel title="Plantillas almacenadas"><p className="mb-3 text-sm text-slate-500">Solo se muestra metadata; los descriptores cifrados no se entregan al navegador.</p><div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Registrada</th><th>Modelo</th><th>Acción</th></tr></thead><tbody>{templates.map(t=><tr key={t.id}><td>{t.student_name} · {t.student_code}</td><td>{new Date(t.created_at).toLocaleString('es-PE')}</td><td>{t.model_version}</td><td><button onClick={()=>void revokeTemplate(t)} className="text-rose-700" title="Eliminar plantilla"><Trash2 size={17}/></button></td></tr>)}</tbody></table>{!templates.length&&<Empty>Aún no hay plantillas. Captura solo con consentimiento explícito.</Empty>}</div></Panel></>}
      {tab==='logs' && <Panel title="Historial de accesos"><div className="mb-3 flex justify-end"><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"><Download size={16}/>Exportar CSV</button></div><LogTable logs={logs}/></Panel>}
      </>}
    </main>
    {captureOpen&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white p-5"><h2 className="text-xl font-black">Captura supervisada</h2><p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm" role="status">{capturePrompt}</p><div className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-slate-950"><video ref={video} muted playsInline className="h-full w-full object-cover"/><div className="face-guide"/></div><div className="mt-4 flex gap-3"><button disabled={busy} onClick={()=>void captureAndEnroll()} className="flex-1 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?<span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin"/>Procesando…</span>:'Capturar y guardar cifrado'}</button><button disabled={busy} onClick={cancelCapture} className="rounded-xl border border-slate-200 px-4 py-3 font-bold">Cancelar</button></div></div></div>}
  </div>
}
const input='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500'
const submit='inline-flex items-center justify-center gap-2 self-end rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white disabled:opacity-50'
function Panel({title,children}:{title:string;children:React.ReactNode}) { return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-extrabold">{title}</h2>{children}</section> }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block text-sm font-semibold">{label}{children}</label> }
function Metric({title,value,icon}:{title:string;value:number;icon:React.ReactNode}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-sm font-bold text-slate-500">{title}<span className="text-blue-700">{icon}</span></div><div className="mt-3 text-3xl font-black">{value}</div></div> }
function Empty({children}:{children:React.ReactNode}) { return <p className="p-5 text-center text-sm text-slate-500">{children}</p> }
function LogTable({logs}:{logs:Log[]}) { return <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Estudiante</th><th>Laboratorio</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{new Date(log.created_at).toLocaleString('es-PE')}</td><td>{log.students?.full_name??'No identificado'} {log.students?.student_code&&`· ${log.students.student_code}`}</td><td>{log.laboratories?.name??'—'}</td><td>{log.result}</td><td>{log.reason}</td></tr>)}</tbody></table>{!logs.length&&<Empty>Sin eventos todavía.</Empty>}</div> }
function daysLabel(mask:number) { return mask===127?'Todos los días':mask===31?'L–V':['L','M','X','J','V','S','D'].filter((_,i)=>Boolean(mask&(1<<i))).join(',') }

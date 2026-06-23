import { useMemo, useState } from 'react'
import { Banknote, Calculator, CreditCard, Home, Landmark, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react'

const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' })
const today = () => new Date().toISOString().slice(0, 10)

const initialTerminalForm = {
  date: today(),
  visaEntries: '',
  visaAmount: '',
  masterEntries: '',
  masterAmount: '',
  mydebitEntries: '',
  mydebitAmount: '',
}

const initialReceivedForm = {
  date: today(),
  visaReceived: '',
  masterReceived: '',
  mydebitReceived: '',
}

const number = (value) => Number(value || 0)

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [terminalRecords, setTerminalRecords] = useState(() => JSON.parse(localStorage.getItem('terminal_records') || '[]'))
  const [receivedRecords, setReceivedRecords] = useState(() => JSON.parse(localStorage.getItem('received_records') || '[]'))
  const [terminalForm, setTerminalForm] = useState(initialTerminalForm)
  const [receivedForm, setReceivedForm] = useState(initialReceivedForm)
  const [editingTerminalId, setEditingTerminalId] = useState(null)
  const [editingReceivedId, setEditingReceivedId] = useState(null)

  const saveTerminal = (next) => {
    setTerminalRecords(next)
    localStorage.setItem('terminal_records', JSON.stringify(next))
  }

  const saveReceived = (next) => {
    setReceivedRecords(next)
    localStorage.setItem('received_records', JSON.stringify(next))
  }

  const terminalTotal = useMemo(() => number(terminalForm.visaAmount) + number(terminalForm.masterAmount) + number(terminalForm.mydebitAmount), [terminalForm])
  const receivedTotal = useMemo(() => number(receivedForm.visaReceived) + number(receivedForm.masterReceived) + number(receivedForm.mydebitReceived), [receivedForm])

  const summary = useMemo(() => {
    const terminal = terminalRecords.reduce((acc, r) => {
      acc.visa += r.visaAmount
      acc.master += r.masterAmount
      acc.mydebit += r.mydebitAmount
      acc.total += r.total
      return acc
    }, { visa: 0, master: 0, mydebit: 0, total: 0 })

    const received = receivedRecords.reduce((acc, r) => acc + r.total, 0)
    return { ...terminal, received, difference: terminal.total - received }
  }, [terminalRecords, receivedRecords])

  const submitTerminal = () => {
    const record = {
      id: editingTerminalId || Date.now(),
      date: terminalForm.date,
      visaEntries: number(terminalForm.visaEntries),
      visaAmount: number(terminalForm.visaAmount),
      masterEntries: number(terminalForm.masterEntries),
      masterAmount: number(terminalForm.masterAmount),
      mydebitEntries: number(terminalForm.mydebitEntries),
      mydebitAmount: number(terminalForm.mydebitAmount),
      total: terminalTotal,
    }
    if (editingTerminalId) saveTerminal(terminalRecords.map((r) => r.id === editingTerminalId ? record : r))
    else saveTerminal([record, ...terminalRecords])
    setTerminalForm(initialTerminalForm)
    setEditingTerminalId(null)
  }

  const submitReceived = () => {
    const record = {
      id: editingReceivedId || Date.now(),
      date: receivedForm.date,
      visaReceived: number(receivedForm.visaReceived),
      masterReceived: number(receivedForm.masterReceived),
      mydebitReceived: number(receivedForm.mydebitReceived),
      total: receivedTotal,
    }
    if (editingReceivedId) saveReceived(receivedRecords.map((r) => r.id === editingReceivedId ? record : r))
    else saveReceived([record, ...receivedRecords])
    setReceivedForm(initialReceivedForm)
    setEditingReceivedId(null)
  }

  const editTerminal = (record) => {
    setTerminalForm({ ...record })
    setEditingTerminalId(record.id)
    setActiveTab('terminal')
  }

  const editReceived = (record) => {
    setReceivedForm({ ...record })
    setEditingReceivedId(record.id)
    setActiveTab('received')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><CreditCard /><div><b>CARD TRACKER</b><span>Credit Card Tracker</span></div></div>
        <NavButton id="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Home />} label="Dashboard" />
        <NavButton id="terminal" activeTab={activeTab} setActiveTab={setActiveTab} icon={<ReceiptText />} label="Terminal Sales" />
        <NavButton id="received" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Landmark />} label="RHB Received" />
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">SHOP CREDIT CARD DAILY SALES</p><h1>{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'terminal' ? 'Terminal Sales' : 'RHB Received'}</h1></div>
          <div className="date-pill">{new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </header>

        {activeTab === 'dashboard' && <Dashboard summary={summary} />}
        {activeTab === 'terminal' && (
          <TerminalSales
            form={terminalForm}
            setForm={setTerminalForm}
            total={terminalTotal}
            onSubmit={submitTerminal}
            records={terminalRecords}
            onEdit={editTerminal}
            onDelete={(id) => saveTerminal(terminalRecords.filter((r) => r.id !== id))}
            editing={!!editingTerminalId}
          />
        )}
        {activeTab === 'received' && (
          <RhbReceived
            form={receivedForm}
            setForm={setReceivedForm}
            total={receivedTotal}
            onSubmit={submitReceived}
            records={receivedRecords}
            onEdit={editReceived}
            onDelete={(id) => saveReceived(receivedRecords.filter((r) => r.id !== id))}
            editing={!!editingReceivedId}
          />
        )}
      </main>

      <nav className="bottom-nav">
        <NavButton id="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Home />} label="Dashboard" />
        <NavButton id="terminal" activeTab={activeTab} setActiveTab={setActiveTab} icon={<ReceiptText />} label="Terminal Sales" />
        <NavButton id="received" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Landmark />} label="RHB Received" />
      </nav>
    </div>
  )
}

function Dashboard({ summary }) {
  return <section className="grid cards">
    <SummaryCard label="Total Visa Sales" value={summary.visa} tone="blue" icon={<BrandLogo type="visa" />} />
    <SummaryCard label="Total Master Sales" value={summary.master} tone="orange" icon={<BrandLogo type="mastercard" />} />
    <SummaryCard label="Total MyDebit Sales" value={summary.mydebit} tone="cyan" icon={<BrandLogo type="mydebit" />} />
    <SummaryCard label="Total Terminal Total" value={summary.total} tone="purple" icon={<Calculator />} />
    <SummaryCard label="Total RHB Received" value={summary.received} tone="green" icon={<Landmark />} />
    <SummaryCard label="Total Difference / Charges" value={summary.difference} tone="yellow" icon={<Banknote />} />
  </section>
}

function TerminalSales({ form, setForm, total, onSubmit, records, onEdit, onDelete, editing }) {
  return <section className="panel">
    <h2>Record daily terminal settlement</h2>
    <input className="date-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
    <TerminalRow brand={<BrandLogo type="visa" small />} label="Visa" entries="visaEntries" amount="visaAmount" form={form} setForm={setForm} />
    <TerminalRow brand={<BrandLogo type="mastercard" small />} label="Master" entries="masterEntries" amount="masterAmount" form={form} setForm={setForm} />
    <TerminalRow brand={<BrandLogo type="mydebit" small />} label="MyDebit" entries="mydebitEntries" amount="mydebitAmount" form={form} setForm={setForm} />
    <TotalBar label="Total Amount (Auto)" value={total} tone="purple" />
    <button className="primary" onClick={onSubmit}>{editing ? 'Update Settlement' : 'Save Settlement'}</button>
    <HistoryTitle />
    {records.map((r) => <TerminalHistory key={r.id} r={r} onEdit={onEdit} onDelete={onDelete} />)}
  </section>
}

function RhbReceived({ form, setForm, total, onSubmit, records, onEdit, onDelete, editing }) {
  return <section className="panel green-panel">
    <h2>Record amount received from RHB</h2>
    <input className="date-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
    <ReceivedRow brand={<BrandLogo type="visa" small />} label="Visa Received Amount (RM)" field="visaReceived" form={form} setForm={setForm} />
    <ReceivedRow brand={<BrandLogo type="mastercard" small />} label="Master Received Amount (RM)" field="masterReceived" form={form} setForm={setForm} />
    <ReceivedRow brand={<BrandLogo type="mydebit" small />} label="MyDebit Received Amount (RM)" field="mydebitReceived" form={form} setForm={setForm} />
    <TotalBar label="Total Received (Auto)" value={total} tone="green" />
    <button className="primary green" onClick={onSubmit}>{editing ? 'Update Received' : 'Save Received'}</button>
    <HistoryTitle />
    {records.map((r) => <ReceivedHistory key={r.id} r={r} onEdit={onEdit} onDelete={onDelete} />)}
  </section>
}

function TerminalRow({ brand, label, entries, amount, form, setForm }) {
  return <div className="input-row three">
    <div className="brand">{brand}</div>
    <label>Entries (Qty)<input type="number" value={form[entries]} onChange={(e) => setForm({ ...form, [entries]: e.target.value })} /></label>
    <label>Amount (RM)<input type="number" value={form[amount]} onChange={(e) => setForm({ ...form, [amount]: e.target.value })} /></label>
  </div>
}

function ReceivedRow({ brand, label, field, form, setForm }) {
  return <div className="input-row received-row">
    <div className="brand">{brand}</div>
    <span>{label}</span>
    <input type="number" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
  </div>
}

function TerminalHistory({ r, onEdit, onDelete }) {
  return <div className="history-card">
    <div className="history-actions"><button onClick={() => onEdit(r)}><Pencil size={16}/></button><button onClick={() => onDelete(r.id)}><Trash2 size={16}/></button></div>
    <b>{niceDate(r.date)}</b>
    <p><BrandLogo type="visa" mini /> {r.visaEntries} | Visa | {money.format(r.visaAmount)}</p>
    <p><BrandLogo type="mastercard" mini /> {r.masterEntries} | Master | {money.format(r.masterAmount)}</p>
    <p><BrandLogo type="mydebit" mini /> {r.mydebitEntries} | MyDebit | {money.format(r.mydebitAmount)}</p>
    <strong className="total-text">Total {money.format(r.total)}</strong>
  </div>
}

function ReceivedHistory({ r, onEdit, onDelete }) {
  return <div className="history-card green-history">
    <div className="history-actions"><button onClick={() => onEdit(r)}><Pencil size={16}/></button><button onClick={() => onDelete(r.id)}><Trash2 size={16}/></button></div>
    <b>{niceDate(r.date)}</b>
    <p><BrandLogo type="visa" mini /> Visa | {money.format(r.visaReceived)}</p>
    <p><BrandLogo type="mastercard" mini /> Master | {money.format(r.masterReceived)}</p>
    <p><BrandLogo type="mydebit" mini /> MyDebit | {money.format(r.mydebitReceived)}</p>
    <strong className="total-text green-text">Total {money.format(r.total)}</strong>
  </div>
}


function BrandLogo({ type, small = false, mini = false }) {
  const logos = {
    visa: "/logos/visa.png",
    mastercard: "/logos/mastercard.png",
    mydebit: "/logos/mydebit.png",
  };

  return (
    <span className={`logo-badge ${small ? "small" : ""} ${mini ? "mini-logo" : ""}`}>
      <img src={logos[type]} alt={type} className="brand-logo" />
    </span>
  );
}

function SummaryCard({ label, value, tone, icon }) {
  return <div className={`summary-card ${tone}`}><div><p>{label}</p><h3>{money.format(value)}</h3></div><div className="icon-badge">{icon}</div></div>
}

function TotalBar({ label, value, tone }) { return <div className={`total-bar ${tone}`}><span>{label}</span><b>{money.format(value)}</b></div> }
function HistoryTitle() { return <h3 className="history-title">History</h3> }
function niceDate(date) { return new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) }
function NavButton({ id, activeTab, setActiveTab, icon, label }) { return <button className={`nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{icon}<span>{label}</span></button> }

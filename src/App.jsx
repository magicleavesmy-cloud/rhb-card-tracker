import { useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Home, ReceiptText, Landmark, Pencil, Trash2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, hasFirebaseConfig } from './firebase'

const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' })
const percent = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const today = () => dateKey(new Date())
const addDays = (date, amount) => {
  const parsed = new Date(`${date || today()}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return today()

  parsed.setDate(parsed.getDate() + amount)
  return dateKey(parsed)
}
const preventFutureDate = (date) => date > today() ? today() : date

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
  cardReceived: '',
  mydebitReceived: '',
}

const number = (value) => Number(value || 0)
const cardReceivedAmount = (record) => (
  record.cardReceived === undefined
    ? number(record.visaReceived) + number(record.masterReceived)
    : number(record.cardReceived)
)
const receivedRecordTotal = (record) => {
  const calculatedTotal = cardReceivedAmount(record) + number(record.mydebitReceived)
  return record.total === undefined ? calculatedTotal : number(record.total)
}
const formatRate = (value) => `${percent.format(value)}%`
const LAST_SYNC_KEY = 'last_synced_at'
const SELECTED_MONTH_KEY = 'rhbSelectedMonth'
const compactDate = (date) => niceDate(date).toUpperCase()
const recordMonth = (date) => String(date || '').slice(0, 7)
const getCurrentMonth = () => today().slice(0, 7)
const buildMonthOptions = () => {
  const year = new Date().getFullYear()

  return Array.from({ length: 12 }, (_, month) => {
    const date = new Date(year, month, 1)
    return {
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    }
  })
}
const readSelectedMonth = () => {
  const currentMonth = getCurrentMonth()
  const stored = localStorage.getItem(SELECTED_MONTH_KEY)
  return stored?.startsWith(`${new Date().getFullYear()}-`) ? stored : currentMonth
}
const filterRecordsByMonth = (records, selectedMonth) => records.filter((transaction) => recordMonth(transaction.date) === selectedMonth)
const terminalSalesForDate = (terminalRecords, date) => terminalRecords.reduce((acc, transaction) => {
  if (transaction.date !== date) return acc

  acc.card += number(transaction.visaAmount) + number(transaction.masterAmount)
  acc.mydebit += number(transaction.mydebitAmount)
  return acc
}, { card: 0, mydebit: 0 })
const terminalFormForDate = (terminalRecords, date) => {
  const matches = terminalRecords.filter((transaction) => transaction.date === date)
  if (!matches.length) {
    return {
      form: { ...initialTerminalForm, date },
      editingId: null,
    }
  }

  const form = matches.reduce((acc, transaction) => {
    acc.visaEntries += number(transaction.visaEntries)
    acc.visaAmount += number(transaction.visaAmount)
    acc.masterEntries += number(transaction.masterEntries)
    acc.masterAmount += number(transaction.masterAmount)
    acc.mydebitEntries += number(transaction.mydebitEntries)
    acc.mydebitAmount += number(transaction.mydebitAmount)
    return acc
  }, { ...initialTerminalForm, date, visaEntries: 0, visaAmount: 0, masterEntries: 0, masterAmount: 0, mydebitEntries: 0, mydebitAmount: 0 })

  return {
    form,
    editingId: matches.length === 1 ? matches[0].id : null,
  }
}
const buildChargeAnalytics = (terminalRecords, receivedRecords, selectedMonth) => {
  const terminalByDate = new Map()
  const receivedByDate = new Map()

  terminalRecords.forEach((record) => {
    terminalByDate.set(record.date, number(terminalByDate.get(record.date)) + number(record.total))
  })
  receivedRecords.forEach((record) => {
    receivedByDate.set(record.date, number(receivedByDate.get(record.date)) + receivedRecordTotal(record))
  })

  const byDate = {}
  terminalByDate.forEach((terminalTotal, date) => {
    if (!receivedByDate.has(date) || terminalTotal <= 0) return

    const receivedTotal = receivedByDate.get(date)
    const charges = terminalTotal - receivedTotal
    byDate[date] = {
      terminalTotal,
      receivedTotal,
      charges,
      chargeRate: (charges / terminalTotal) * 100,
    }
  })

  const monthly = Object.entries(byDate).reduce((acc, [date, analytics]) => {
    if (recordMonth(date) !== selectedMonth) return acc

    acc.terminalTotal += analytics.terminalTotal
    acc.receivedTotal += analytics.receivedTotal
    acc.charges += analytics.charges
    return acc
  }, { terminalTotal: 0, receivedTotal: 0, charges: 0 })

  monthly.chargeRate = monthly.terminalTotal > 0 ? (monthly.charges / monthly.terminalTotal) * 100 : 0

  return { byDate, monthly }
}
const buildMonthDays = (terminalRecords, receivedRecords, selectedMonth) => {
  const terminalByDate = new Map()
  const receivedByDate = new Map()

  terminalRecords.forEach((record) => {
    if (!record.date) return
    terminalByDate.set(record.date, number(terminalByDate.get(record.date)) + number(record.total))
  })
  receivedRecords.forEach((record) => {
    if (!record.date) return
    receivedByDate.set(record.date, number(receivedByDate.get(record.date)) + receivedRecordTotal(record))
  })

  const [year, month] = selectedMonth.split('-').map(Number)
  const now = new Date()
  const isCurrentMonth = selectedMonth === getCurrentMonth()
  const dayCount = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(year, month - 1, dayCount - index)
    const dayKey = dateKey(date)
    const hasTerminal = terminalByDate.has(dayKey)
    const hasReceived = receivedByDate.has(dayKey)
    const terminalTotal = number(terminalByDate.get(dayKey))
    const receivedTotal = number(receivedByDate.get(dayKey))
    const commission = terminalTotal - receivedTotal
    const percentage = terminalTotal > 0 ? (commission / terminalTotal) * 100 : 0
    const hasRecords = hasTerminal || hasReceived
    const status = hasTerminal && hasReceived
      ? 'MATCHED'
      : hasReceived
        ? 'MISSING TERMINAL'
        : hasTerminal
          ? 'MISSING RHB'
          : 'NO ENTRY'

    return { date: dayKey, terminalTotal, receivedTotal, commission, percentage, hasRecords, hasTerminal, hasReceived, status }
  })
}
const buildTerminalAverages = (terminalRecords, selectedMonth) => {
  const days = new Map()

  terminalRecords.forEach((record) => {
    if (recordMonth(record.date) !== selectedMonth) return

    const day = days.get(record.date) || { visa: 0, master: 0, mydebit: 0, total: 0 }
    day.visa += number(record.visaAmount)
    day.master += number(record.masterAmount)
    day.mydebit += number(record.mydebitAmount)
    day.total += number(record.total)
    days.set(record.date, day)
  })

  const totals = Array.from(days.values()).reduce((acc, day) => {
    acc.visa += day.visa
    acc.master += day.master
    acc.mydebit += day.mydebit
    acc.total += day.total
    return acc
  }, { visa: 0, master: 0, mydebit: 0, total: 0 })
  const count = days.size || 1

  return {
    visa: totals.visa / count,
    master: totals.master / count,
    mydebit: totals.mydebit / count,
    total: totals.total / count,
  }
}
const readStoredRecords = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}
const readLastSyncedAt = () => {
  const stored = localStorage.getItem(LAST_SYNC_KEY)
  if (!stored) return null

  const parsed = new Date(stored)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const formatSyncTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

const recordsDoc = db ? doc(db, 'rhb-card-tracker', 'shared') : null

function AppIcon({ name, className = "custom-icon" }) {
  return <img src={`/icons/${name}.png`} className={className} alt="" />
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [terminalRecords, setTerminalRecords] = useState(() => readStoredRecords('terminal_records'))
  const [receivedRecords, setReceivedRecords] = useState(() => readStoredRecords('received_records'))
  const [terminalForm, setTerminalForm] = useState(initialTerminalForm)
  const [receivedForm, setReceivedForm] = useState(initialReceivedForm)
  const [editingTerminalId, setEditingTerminalId] = useState(null)
  const [editingReceivedId, setEditingReceivedId] = useState(null)
  const [syncStatus, setSyncStatus] = useState(hasFirebaseConfig ? 'Loading cloud records...' : 'Add Firebase env to enable sync')
  const [lastSyncedAt, setLastSyncedAt] = useState(readLastSyncedAt)
  const [selectedMonth, setSelectedMonth] = useState(readSelectedMonth)
  const latestRecords = useRef({ terminalRecords, receivedRecords })
  const monthOptions = useMemo(buildMonthOptions, [])

  const markSynced = () => {
    const syncedAt = new Date()
    localStorage.setItem(LAST_SYNC_KEY, syncedAt.toISOString())
    setLastSyncedAt(syncedAt)
  }

  const persistLocal = (nextTerminal, nextReceived) => {
    localStorage.setItem('terminal_records', JSON.stringify(nextTerminal))
    localStorage.setItem('received_records', JSON.stringify(nextReceived))
    latestRecords.current = { terminalRecords: nextTerminal, receivedRecords: nextReceived }
  }

  const syncToCloud = async (nextTerminal, nextReceived) => {
    if (!recordsDoc) return

    await setDoc(recordsDoc, {
      terminalRecords: nextTerminal,
      receivedRecords: nextReceived,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  const persistRecords = (nextTerminal, nextReceived) => {
    setTerminalRecords(nextTerminal)
    setReceivedRecords(nextReceived)
    persistLocal(nextTerminal, nextReceived)

    if (!recordsDoc || !navigator.onLine) {
      setSyncStatus('Saved locally, cloud pending')
      return
    }

    setSyncStatus('Syncing...')
    syncToCloud(nextTerminal, nextReceived)
      .then(() => {
        setSyncStatus('Synced')
        markSynced()
      })
      .catch((error) => {
        console.error('Firebase sync failed:', error)
        setSyncStatus('Saved locally, cloud pending')
      })
  }

  useEffect(() => {
    latestRecords.current = { terminalRecords, receivedRecords }
  }, [terminalRecords, receivedRecords])

  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    if (!recordsDoc) return

    return onSnapshot(recordsDoc, (snapshot) => {
      if (!snapshot.exists()) {
        syncToCloud(latestRecords.current.terminalRecords, latestRecords.current.receivedRecords)
          .then(() => {
            setSyncStatus('Local records synced')
            markSynced()
          })
          .catch((error) => {
            console.error('Firebase sync failed:', error)
            setSyncStatus('Cloud unavailable, using local backup')
          })
        return
      }

      const cloud = snapshot.data()
      const cloudTerminal = Array.isArray(cloud.terminalRecords) ? cloud.terminalRecords : []
      const cloudReceived = Array.isArray(cloud.receivedRecords) ? cloud.receivedRecords : []
      persistLocal(cloudTerminal, cloudReceived)
      setTerminalRecords(cloudTerminal)
      setReceivedRecords(cloudReceived)
      setSyncStatus('Synced')
      markSynced()
    }, (error) => {
      console.error('Firebase sync failed:', error)
      setSyncStatus('Cloud unavailable, using local backup')
    })
  }, [])

  const saveTerminal = (next) => {
    persistRecords(next, receivedRecords)
  }

  const saveReceived = (next) => {
    persistRecords(terminalRecords, next)
  }

  const exportBackup = () => {
    const backup = {
      appName: 'Magic-RHB Sales',
      exportedAt: new Date().toISOString(),
      terminalRecords,
      receivedRecords,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `magic-rhb-sales-backup-${today()}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (file) => {
    if (!file) return

    let backup
    try {
      backup = JSON.parse(await file.text())
    } catch (error) {
      console.error('Backup import failed:', error)
      alert('Backup import failed. Please choose a valid JSON backup file.')
      return
    }

    if (!Array.isArray(backup.terminalRecords) || !Array.isArray(backup.receivedRecords)) {
      alert('Invalid backup file.')
      return
    }

    const nextTerminal = backup.terminalRecords
    const nextReceived = backup.receivedRecords
    setTerminalRecords(nextTerminal)
    setReceivedRecords(nextReceived)
    persistLocal(nextTerminal, nextReceived)

    if (recordsDoc && navigator.onLine) {
      try {
        setSyncStatus('Syncing...')
        await syncToCloud(nextTerminal, nextReceived)
        setSyncStatus('Synced')
        markSynced()
      } catch (error) {
        console.error('Backup cloud sync failed:', error)
        setSyncStatus('Imported locally, cloud pending')
      }
    } else {
      setSyncStatus('Imported locally, cloud pending')
    }

    alert('Backup imported successfully.')
  }

  const syncNow = async () => {
    if (!recordsDoc) {
      setSyncStatus('Add Firebase env to enable sync')
      return
    }

    if (!navigator.onLine) {
      setSyncStatus('Offline, using local backup')
      return
    }

    try {
      setSyncStatus('Syncing...')
      await syncToCloud(latestRecords.current.terminalRecords, latestRecords.current.receivedRecords)
      setSyncStatus('Synced')
      markSynced()
    } catch (error) {
      console.error('Manual sync failed:', error)
      setSyncStatus('Cloud unavailable, using local backup')
    }
  }

  const visaMasterTotal = useMemo(() => number(terminalForm.visaAmount) + number(terminalForm.masterAmount), [terminalForm])
  const terminalTotal = useMemo(() => visaMasterTotal + number(terminalForm.mydebitAmount), [terminalForm, visaMasterTotal])
  const receivedTotal = useMemo(() => number(receivedForm.cardReceived) + number(receivedForm.mydebitReceived), [receivedForm])
  const filteredTerminalRecords = useMemo(() => filterRecordsByMonth(terminalRecords, selectedMonth), [terminalRecords, selectedMonth])
  const filteredReceivedRecords = useMemo(() => filterRecordsByMonth(receivedRecords, selectedMonth), [receivedRecords, selectedMonth])
  const chargeAnalytics = useMemo(() => buildChargeAnalytics(terminalRecords, receivedRecords, selectedMonth), [terminalRecords, receivedRecords, selectedMonth])
  const selectedMonthDays = useMemo(() => buildMonthDays(terminalRecords, receivedRecords, selectedMonth), [terminalRecords, receivedRecords, selectedMonth])
  const terminalAverages = useMemo(() => buildTerminalAverages(terminalRecords, selectedMonth), [terminalRecords, selectedMonth])
  const selectedMonthLabel = monthOptions.find((month) => month.value === selectedMonth)?.label || selectedMonth
  const syncLabel = lastSyncedAt ? `✓ Synced ${formatSyncTime(lastSyncedAt)}` : 'Sync pending'

  const summary = useMemo(() => {
    const terminal = filteredTerminalRecords.reduce((acc, r) => {
      acc.visa += r.visaAmount
      acc.master += r.masterAmount
      acc.mydebit += r.mydebitAmount
      acc.total += r.total
      return acc
    }, { visa: 0, master: 0, mydebit: 0, total: 0 })

    const received = filteredReceivedRecords.reduce((acc, r) => acc + receivedRecordTotal(r), 0)
    return {
      ...terminal,
      received,
      difference: terminal.total - received,
      monthlyCharges: chargeAnalytics.monthly.charges,
      monthlyChargeRate: chargeAnalytics.monthly.chargeRate,
      terminalAverages,
    }
  }, [filteredTerminalRecords, filteredReceivedRecords, chargeAnalytics, terminalAverages])

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
      cardReceived: number(receivedForm.cardReceived),
      mydebitReceived: number(receivedForm.mydebitReceived),
      total: receivedTotal,
    }
    if (editingReceivedId) saveReceived(receivedRecords.map((r) => r.id === editingReceivedId ? record : r))
    else saveReceived([record, ...receivedRecords])
    setReceivedForm(initialReceivedForm)
    setEditingReceivedId(null)
  }

  const updateTerminalDate = (nextDate) => {
    if (!nextDate) return

    const safeDate = preventFutureDate(nextDate)
    const nextTerminalForm = terminalFormForDate(terminalRecords, safeDate)
    setTerminalForm(nextTerminalForm.form)
    setEditingTerminalId(nextTerminalForm.editingId)
    setSelectedMonth(recordMonth(safeDate))
  }

  const editTerminal = (record) => {
    setSelectedMonth(recordMonth(record.date))
    setTerminalForm({ ...record })
    setEditingTerminalId(record.id)
    setActiveTab('terminal')
  }

  const editReceived = (record) => {
    setSelectedMonth(recordMonth(record.date))
    setReceivedForm({
      date: record.date,
      cardReceived: String(cardReceivedAmount(record) || ''),
      mydebitReceived: String(record.mydebitReceived || ''),
    })
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
          <div><p className="eyebrow">MAGIC LEAVES RHB TERMINAL SALES</p><h1>{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'terminal' ? 'Terminal Sales' : 'RHB Received'}</h1></div>
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={syncNow} title="Sync Now"><RefreshCw size={16} /><span>Sync Now</span></button>
            <label className="month-selector" aria-label="Dashboard month">
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <span className={`sync-status ${lastSyncedAt ? 'synced' : 'pending'}`} title={syncStatus}>{syncLabel}</span>
          </div>
        </header>

        {activeTab === 'dashboard' && <Dashboard summary={summary} currentMonthDays={selectedMonthDays} selectedMonthLabel={selectedMonthLabel} />}
        {activeTab === 'terminal' && (
          <TerminalSales
            form={terminalForm}
            setForm={setTerminalForm}
            total={terminalTotal}
            visaMasterTotal={visaMasterTotal}
            onSubmit={submitTerminal}
            records={terminalRecords}
            onDateChange={updateTerminalDate}
            chargesByDate={chargeAnalytics.byDate}
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
            terminalRecords={terminalRecords}
            setSelectedMonth={setSelectedMonth}
            chargesByDate={chargeAnalytics.byDate}
            onEdit={editReceived}
            onDelete={(id) => saveReceived(receivedRecords.filter((r) => r.id !== id))}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
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

function Dashboard({ summary, currentMonthDays, selectedMonthLabel }) {
  return <div className="dashboard-view dashboard-page">
    <div className="dashboard-summary-screen">
      <section className="grid cards">
        <SummaryCard label="Total Visa Sales" value={summary.visa} average={summary.terminalAverages.visa} tone="blue" icon={<BrandLogo type="visa" />} />
        <SummaryCard label="Total Master Sales" value={summary.master} average={summary.terminalAverages.master} tone="orange" icon={<BrandLogo type="mastercard" />} />
        <SummaryCard label="Total MyDebit Sales" value={summary.mydebit} average={summary.terminalAverages.mydebit} tone="cyan" icon={<BrandLogo type="mydebit" />} />
        <SummaryCard label="Total Terminal Total" value={summary.total} average={summary.terminalAverages.total} tone="purple" icon={<span style={{ fontSize: "30px" }}>💳</span>} />
        <SummaryCard label="Total RHB Received" value={summary.received} tone="green" icon={<span style={{ fontSize: "30px" }}>🏦</span>} />
        <SummaryCard label="Total Difference / Charges" value={summary.difference} tone="yellow" icon={<span style={{ fontSize: "30px" }}>📊</span>} />
        <SummaryCard label="Monthly Charges" value={summary.monthlyCharges} tone="yellow" icon={<span className="gold-dollar-icon">💲</span>} />
        <SummaryCard label="Monthly Charge Rate" value={formatRate(summary.monthlyChargeRate)} tone="green" icon={<span style={{ fontSize: "30px" }}>%</span>} raw />
      </section>
    </div>
    <section className="last-days-panel">
      <h2>{selectedMonthLabel} Terminal Sales</h2>
      <div className="last-days-list">
        {currentMonthDays.map((row) => (
          <div className="last-day-card" key={row.date}>
            <div className="last-day-top">
              <b>{compactDate(row.date)}</b>
            </div>
            <div className="last-day-metrics">
              <div className="last-day-chips">
                <span className={`metric-chip terminal ${row.hasTerminal ? '' : 'missing'}`}>{row.hasTerminal ? money.format(row.terminalTotal) : '-'}</span>
                <span className={`metric-chip received ${row.hasReceived ? '' : 'missing'}`}>{row.hasReceived ? money.format(row.receivedTotal) : '-'}</span>
                <span className={`metric-chip commission ${row.hasRecords ? '' : 'missing'}`}>{row.hasRecords ? money.format(row.commission) : '-'}</span>
                <span className="metric-chip percent">{formatRate(row.percentage)}</span>
              </div>
              <span className={`status-dot ${row.hasTerminal && row.hasReceived ? 'complete' : row.hasRecords ? 'partial' : 'missing'}`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  </div>
}

function TerminalSales({ form, setForm, total, visaMasterTotal, onSubmit, records, onDateChange, chargesByDate, onEdit, onDelete, editing }) {
  const sortedRecords = [...records].sort((a, b) => {
    const dateOrder = String(b.date || '').localeCompare(String(a.date || ''))
    return dateOrder || number(b.id) - number(a.id)
  })
  const isTodaySelected = form.date >= today()

  return <section className="panel terminal-page">
    <div className="terminal-entry-header">
      <h2>Record daily terminal settlement</h2>
      <div className="terminal-date-nav">
        <button type="button" className="date-arrow-btn" onClick={() => onDateChange(addDays(form.date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <input className="date-input terminal-date-input" type="date" value={form.date} max={today()} onChange={(e) => onDateChange(e.target.value)} />
        <button type="button" className="date-arrow-btn" onClick={() => onDateChange(addDays(form.date, 1))} disabled={isTodaySelected} aria-label="Next day"><ChevronRight size={16} /></button>
      </div>
    </div>
    <TerminalRow brand={<BrandLogo type="visa" small />} label="Visa" entries="visaEntries" amount="visaAmount" form={form} setForm={setForm} />
    <TerminalRow brand={<BrandLogo type="mastercard" small />} label="Master" entries="masterEntries" amount="masterAmount" form={form} setForm={setForm} />
    <MiniTotalBar label="Visa + Master Total (Auto)" value={visaMasterTotal} />
    <TerminalRow brand={<BrandLogo type="mydebit" small />} label="MyDebit" entries="mydebitEntries" amount="mydebitAmount" form={form} setForm={setForm} />
    <TotalBar label="Total Amount (Auto)" value={total} tone="purple" />
    <button className="primary" onClick={onSubmit}>{editing ? 'Update Settlement' : 'Save Settlement'}</button>
    <HistoryTitle />
    {sortedRecords.map((r) => <TerminalHistory key={r.id} r={r} charges={chargesByDate[r.date]} onEdit={onEdit} onDelete={onDelete} />)}
  </section>
}

function RhbReceived({ form, setForm, total, onSubmit, records, terminalRecords, setSelectedMonth, chargesByDate, onEdit, onDelete, onExportBackup, onImportBackup, editing }) {
  const sortedRecords = [...records].sort((a, b) => {
    const dateOrder = String(b.date || '').localeCompare(String(a.date || ''))
    return dateOrder || number(b.id) - number(a.id)
  })
  const actualTerminalSales = useMemo(() => terminalSalesForDate(terminalRecords, form.date), [terminalRecords, form.date])
  const fileInputRef = useRef(null)
  const isTodaySelected = form.date >= today()
  const updateReceivedDate = (nextDate) => {
    if (!nextDate) return

    const safeDate = preventFutureDate(nextDate)
    setForm({ ...form, date: safeDate })
    setSelectedMonth(recordMonth(safeDate))
  }

  return <section className="panel green-panel received-page">
    <div className="received-entry-header">
      <h2>Record amount received from RHB</h2>
      <div className="received-date-nav">
        <button type="button" className="date-arrow-btn" onClick={() => updateReceivedDate(addDays(form.date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <input className="date-input received-date-input" type="date" value={form.date} max={today()} onChange={(e) => updateReceivedDate(e.target.value)} />
        <button type="button" className="date-arrow-btn" onClick={() => updateReceivedDate(addDays(form.date, 1))} disabled={isTodaySelected} aria-label="Next day"><ChevronRight size={16} /></button>
      </div>
    </div>
    <ReceivedRow brand={<div style={{ display: "flex", gap: "8px", alignItems: "center" }}><BrandLogo type="visa" small /><BrandLogo type="mastercard" small /></div>} label="Visa/Master Received Amount (RM)" field="cardReceived" form={form} setForm={setForm} actualTerminalSales={actualTerminalSales.card} />
    <ReceivedRow brand={<BrandLogo type="mydebit" small />} label="MyDebit Received Amount (RM)" field="mydebitReceived" form={form} setForm={setForm} actualTerminalSales={actualTerminalSales.mydebit} />
    <TotalBar label="Total Received (Auto)" value={total} tone="green" />
    <button className="primary green" onClick={onSubmit}>{editing ? 'Update Received' : 'Save Received'}</button>
    <HistoryTitle />
    {sortedRecords.map((r) => <ReceivedHistory key={r.id} r={r} charges={chargesByDate[r.date]} onEdit={onEdit} onDelete={onDelete} />)}
    <section className="backup-section">
      <h3>Backup</h3>
      <div className="backup-actions">
        <button type="button" onClick={onExportBackup}>Export Backup</button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>Import Backup</button>
      </div>
      <input
        ref={fileInputRef}
        className="backup-file"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          onImportBackup(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </section>
  </section>
}

function TerminalRow({ brand, label, entries, amount, form, setForm }) {
  return <div className="input-row three">
    <div className="brand">{brand}</div>
    <div className="terminal-fields">
      <label>Qty<input type="text" inputMode="numeric" value={form[entries]} onChange={(e) => setForm({ ...form, [entries]: e.target.value })} /></label>
      <label>Amount (RM)<input type="text" inputMode="numeric" value={form[amount]} onChange={(e) => setForm({ ...form, [amount]: e.target.value })} /></label>
    </div>
  </div>
}

function ReceivedRow({ brand, label, field, form, setForm, actualTerminalSales }) {
  return <div className="input-row received-row">
    <div className="brand">{brand}</div>
    <span>{label}</span>
    <div className="received-entry-field">
      <div className="actual-terminal-chip"><span>Actual Terminal Sales:</span><b>{money.format(actualTerminalSales)}</b></div>
      <input type="text" inputMode="numeric" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
    </div>
  </div>
}

function ChargesDetails({ charges }) {
  if (!charges) return null

  return <div className="history-money-row charges-row"><span>Charges</span><b>{money.format(charges.charges)} ({formatRate(charges.chargeRate)})</b></div>
}

function TerminalHistory({ r, charges, onEdit, onDelete }) {
  return <div className="history-card">
    <div className="history-actions"><button onClick={() => onEdit(r)}><Pencil size={16}/></button><button onClick={() => onDelete(r.id)}><Trash2 size={16}/></button></div>
    <b className="history-date">{compactDate(r.date)}</b>
    <div className="history-money-row"><span>Visa</span><b>{r.visaEntries} | {money.format(r.visaAmount)}</b></div>
    <div className="history-money-row"><span>Master</span><b>{r.masterEntries} | {money.format(r.masterAmount)}</b></div>
    <div className="history-visa-master-total"><span>TOTAL</span><b>{money.format(number(r.visaAmount) + number(r.masterAmount))}</b></div>
    <div className="history-money-row"><span>MyDebit</span><b>{r.mydebitEntries} | {money.format(r.mydebitAmount)}</b></div>
    <ChargesDetails charges={charges} />
    <strong className="total-text history-total"><span>TOTAL</span><b>{money.format(r.total)}</b></strong>
  </div>
}

function ReceivedHistory({ r, charges, onEdit, onDelete }) {
  return <div className="history-card green-history">
    <div className="history-actions"><button onClick={() => onEdit(r)}><Pencil size={16}/></button><button onClick={() => onDelete(r.id)}><Trash2 size={16}/></button></div>
    <b className="history-date">{compactDate(r.date)}</b>
    <div className="history-money-row"><span>Visa/Master</span><b>{money.format(cardReceivedAmount(r))}</b></div>
    <div className="history-money-row"><span>MyDebit</span><b>{money.format(number(r.mydebitReceived))}</b></div>
    <ChargesDetails charges={charges} />
    <strong className="total-text green-text history-total"><span>TOTAL</span><b>{money.format(receivedRecordTotal(r))}</b></strong>
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

function SummaryCard({ label, value, average, tone, icon, raw = false }) {
  return <div className={`summary-card ${tone}`}><div><p>{label}</p><h3>{raw ? value : money.format(value)}</h3>{average !== undefined && <span className="avg-chip">AVG/DAY {money.format(average)}</span>}</div><div className="icon-badge">{icon}</div></div>
}

function TotalBar({ label, value, tone }) { return <div className={`total-bar ${tone}`}><span>{label}</span><b>{money.format(value)}</b></div> }
function MiniTotalBar({ label, value }) { return <div className="mini-total-bar"><span>{label}</span><b>{money.format(value)}</b></div> }
function HistoryTitle() { return <h3 className="history-title">History</h3> }
function niceDate(date) { return new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) }
function NavButton({ id, activeTab, setActiveTab, icon, label }) { return <button className={`nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{icon}<span>{label}</span></button> }

'use client'

import { useEffect, useRef, useState } from 'react'

// Brazilian cities for social proof
const BR_CITIES = [
  'São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'Salvador, BA',
  'Fortaleza, CE', 'Curitiba, PR', 'Manaus, AM', 'Recife, PE', 'Porto Alegre, RS',
  'Belém, PA', 'Goiânia, GO', 'Guarulhos, SP', 'Campinas, SP', 'São Luís, MA',
  'São Gonçalo, RJ', 'Maceió, AL', 'Natal, RN', 'Teresina, PI', 'Florianópolis, SC',
  'Campo Grande, MS', 'Sorocaba, SP', 'Ribeirão Preto, SP', 'Aracaju, SE',
  'Uberlândia, MG', 'Contagem, MG', 'Feira de Santana, BA', 'Joinville, SC',
  'João Pessoa, PB', 'Santos, SP', 'Maringá, PR', 'Londrina, PR', 'Vitória, ES',
  'Mauá, SP', 'Cuiabá, MT', 'Montes Claros, MG', 'Caxias do Sul, RS',
]

interface SaleToastItem {
  id: number
  name: string
  city: string
}

interface SaleToastProps {
  /** When true, the component starts firing toasts */
  active: boolean
  /** Pool of names to pick from */
  namesPool: string[]
}

let toastIdCounter = 0

export default function SaleToast({ active, namesPool }: SaleToastProps) {
  const [queue, setQueue] = useState<SaleToastItem[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(active)

  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    function fireNext() {
      if (!activeRef.current) return

      const name = namesPool[Math.floor(Math.random() * namesPool.length)]
      const city = BR_CITIES[Math.floor(Math.random() * BR_CITIES.length)]
      const id = ++toastIdCounter

      setQueue(q => [...q.slice(-2), { id, name, city }]) // max 3 visible

      // Auto-remove after 5s
      setTimeout(() => {
        setQueue(q => q.filter(t => t.id !== id))
      }, 5000)

      // Next toast in 8–20s
      const delay = 8000 + Math.random() * 12000
      timerRef.current = setTimeout(fireNext, delay)
    }

    // First toast after 4s
    timerRef.current = setTimeout(fireNext, 4000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [active, namesPool])

  if (queue.length === 0) return null

  return (
    <div className="sale-toast-stack">
      {queue.map(item => (
        <SaleToastCard key={item.id} name={item.name} city={item.city} />
      ))}
    </div>
  )
}

function SaleToastCard({ name, city }: { name: string; city: string }) {
  const [visible, setVisible] = useState(false)
  const firstName = name.split(' ')[0]

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="sale-toast-card"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(-120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
      }}
    >
      <div className="sale-toast-icon">🛒</div>
      <div className="sale-toast-body">
        <div className="sale-toast-name">
          <strong>{firstName}</strong> de <span>{city}</span>
        </div>
        <div className="sale-toast-msg">acabou de garantir a vaga! 🎉</div>
      </div>
    </div>
  )
}

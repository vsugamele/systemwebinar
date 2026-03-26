'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterAdminPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-bg-glow top-left" />
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 className="auth-title">Conta criada!</h2>
          <p className="auth-subtitle">Verifique seu e-mail para confirmar a conta e então faça login.</p>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 24, width: '100%' }}>
            Ir para o Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-glow top-left" />
      <div className="auth-bg-glow bottom-right" />

      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🎬</div>
          <span className="auth-logo-text">WebinarFlow</span>
        </div>

        <h1 className="auth-title">Criar conta grátis</h1>
        <p className="auth-subtitle">Comece a criar webinars que convertem</p>

        <form className="auth-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input
              type="text"
              className="form-input"
              placeholder="Seu nome"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input
              type="email"
              className="form-input"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              type="password"
              className="form-input"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {error && <p className="form-error">⚠ {error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? <span className="spinner" /> : 'Criar Conta Grátis'}
          </button>
        </form>

        <div className="auth-footer">
          Já tem conta? <Link href="/login">Entrar</Link>
        </div>
      </div>
    </div>
  )
}

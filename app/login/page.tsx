'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/admin')
    }
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

        <h1 className="auth-title">Entrar na plataforma</h1>
        <p className="auth-subtitle">Acesse seu painel de controle</p>

        <form className="auth-form" onSubmit={handleLogin}>
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
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="form-error">⚠ {error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? <span className="spinner" /> : 'Entrar'}
          </button>
        </form>

        <div className="auth-footer">
          Não tem conta?{' '}
          <Link href="/register-admin">Criar conta grátis</Link>
        </div>
      </div>
    </div>
  )
}

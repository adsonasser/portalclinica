# Portal Clínica v2 — Setup

## Pré-requisitos
- Node.js 20+
- PostgreSQL rodando localmente

## Configuração do banco

Criar banco no PostgreSQL:
```sql
CREATE DATABASE portal_clinica_v2;
```

Ou se usar usuário/senha específicos:
```sql
CREATE USER myuser WITH PASSWORD 'mypassword';
CREATE DATABASE portal_clinica_v2 OWNER myuser;
```

Ajustar a `DATABASE_URL` no `backend/.env`.

## Inicializar o backend

```bash
cd backend
npx prisma db push          # Aplica o schema no banco
npx tsx prisma/seed.ts      # Cria dados iniciais

npm run start:dev           # Roda na porta 3002
```

**Login inicial:**
- Email: `admin@clinica.com`
- Senha: `admin123`

## Inicializar o frontend

```bash
cd frontend
npm run dev                 # Roda na porta 5174
```

## Acessar

- **Frontend:** http://localhost:5174
- **API:** http://localhost:3002/api

## Portas

| Serviço  | Porta |
|----------|-------|
| API      | 3002  |
| Frontend | 5174  |

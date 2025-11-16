# Impostor Game - Pusher Integration

Aplikace byla přepracována z Socket.io na Pusher pro kompatibilitu s Vercel.

## Nastavení

### 1. Pusher účet
1. Vytvořte si účet na [pusher.com](https://pusher.com)
2. Vytvořte novou aplikaci
3. Zkopírujte App ID, Key, Secret a Cluster

### 2. Environment proměnné
Vytvořte soubor `.env.local` v kořenovém adresáři projektu s následujícími proměnnými:

```env
PUSHER_APP_ID=2078390
PUSHER_SECRET=64fad01c0b22ed670a37
NEXT_PUBLIC_PUSHER_KEY=a8afa5181ccf9660f3e2
NEXT_PUBLIC_PUSHER_CLUSTER=eu
```

**Důležité:** Tyto hodnoty jsou již nastavené pro vaši Pusher aplikaci. Stačí vytvořit soubor `.env.local` a zkopírovat výše uvedené hodnoty.

### 3. Pusher konfigurace
V Pusher dashboardu:
- Povolte "Client Events" (pokud potřebujete)
- Nastavte "Authorized connections" podle potřeby

## Instalace

```bash
npm install
```

## Spuštění

### Development
```bash
npm run dev
```

### Production (Vercel)
```bash
npm run build
npm start
```

## Nasazení na Vercel

1. Pushněte kód na GitHub
2. Připojte repo k Vercel
3. Přidejte environment proměnné v Vercel dashboardu
4. Deploy!

## Rozdíly oproti Socket.io verzi

- **API Routes**: Všechna game logika je v Next.js API routes (`/app/api/`)
- **Pusher Channels**: Místo Socket.io rooms používáme Pusher channels
- **Private Channels**: Pro individuální zprávy hráčům používáme private channels
- **Serverless**: Aplikace je plně serverless a kompatibilní s Vercel

## Struktura

- `lib/pusher.ts` - Pusher server konfigurace
- `lib/game-state.ts` - Game state management
- `app/api/rooms/` - API routes pro místnosti
- `app/api/game/` - API routes pro game logiku
- `app/api/pusher/auth/` - Pusher authentication endpoint
- `app/page.tsx` - Frontend s Pusher klientem


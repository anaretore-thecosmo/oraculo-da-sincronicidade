# Plano para levar o Oráculo à nota máxima

**Data:** 28/08/2026 · Continuação de [`PLANO-ARQUITETURA-2026-08-27.md`](PLANO-ARQUITETURA-2026-08-27.md),
que fechou a divergência entre produção e git e deixou a nota em **3,7/10 (🟠 frágil)**.

Este documento é o caminho de **3,7 → 10**, e inclui a troca das cartas do Drive
pelas artes autorais.

Regra deste documento: o que foi medido está marcado com a medição; o que não foi
está marcado **NÃO VERIFICADO**. Nenhuma linha promete mecanismo que não existe.

---

## 1. As cartas — o que existe hoje, medido no Drive em 28/08

Nome da pasta raiz: **`Oráculo da Sincronicidade`**
(`drive.google.com/drive/folders/1VadJNd4O5sBbKxL6pqZOodwjyLP-k2UB`).

| Baralho | Onde, no Drive | Artes | Situação |
|---|---|---|---|
| Arcanos Maiores | `Arcanos Maiores / Artes Oficiais` | **22 de 22** | ✅ completo (0 O Louco → XXI O Mundo) |
| Arcanos Menores | `Arcanos Menores / 01–04 (naipe) / Artes Oficiais` | **56 de 56** | ✅ completo (14 por naipe: Paus, Copas, Espadas, Ouros) |
| Baralho Cigano | `Baralho Cigano Autoral / 02 — Artes Aprovadas` | **36 de 36** | ✅ completo (01 O Cavaleiro → 36 A Cruz) |
| **Total** | | **114 de 114** | ✅ **o baralho inteiro está pronto** |

PNG, entre 1,2 MB e 3,7 MB cada. **Massa total ≈ 330 MB** — número que decide quase
tudo no plano de substituição.

### O que o site mostra hoje

`src/App.tsx`, na face da carta:

```tsx
src={`https://picsum.photos/seed/${encodeURIComponent(card + " mystical energy")}/300/450`}
```

**São fotos aleatórias de um banco de imagens externo.** Não é o teu baralho, não tem
relação com a carta sorteada, e cada leitura dispara requisições do navegador da
visitante para um servidor de terceiro. Trocar isso é, ao mesmo tempo:

- **produto** — a arte autoral aparece onde hoje aparece foto genérica;
- **arquitetura** — mata uma dependência externa na borda (padrão 6);
- **privacidade** — o navegador da visitante para de conversar com um terceiro.

### Os três atritos reais da substituição

**1. Peso.** 330 MB de PNG não vão para dentro de um site. Uma leitura de 9 cartas
baixaria ~27 MB. A conversão para WebP em 600×900 traz cada carta para a casa de
**150–250 KB**; o baralho inteiro fica em torno de **25 MB**, e uma leitura de 9
cartas em ~2 MB.

**2. Os nomes não batem.** O código e o Drive usam convenções diferentes, e em vários
casos o nome é outro:

| No código (`App.tsx`) | No Drive | Tipo de diferença |
|---|---|---|
| `O Pendurado` | `Arcano XII - O Enforcado` | **nome diferente** |
| `O Rato` | `Carta 23 — Os Ratos` | singular × plural |
| `A Estrela` (cigano) | `Carta 16 - As Estrelas` | singular × plural |
| `O Caminho` | `Carta 22 — Os Caminhos` | singular × plural |
| `O Peixe` | `Carta 34 - Os Peixes` | singular × plural |
| `As Flores` | `09 — O Buquê — Arte Final` | **nome diferente** |
| `Ás de Paus` | `As de Paus.png` | acento |
| `Dez de Copas` | `10 — Dez de Copas.png` | prefixo numérico |
| `Rei de Paus` | `Rei de Paus.png` | sem prefixo (Paus foge do padrão dos outros naipes) |
| `O Cavaleiro` (cigano) | `Carta 01 — O Cavaleiro` | prefixo + separador `—` |

Some-se a isso: separador ora `-`, ora `—`; sufixos `— Arte Oficial` / `— Arte Final`
em algumas; uma carta de Ouros com sufixo pessoal (`12 — Cavaleiro de Ouros — Haiquel
e Thor`).

**Conclusão que muda o desenho:** casar nome de arquivo com nome de carta por
adivinhação é onde isso quebra. A ligação tem que ser **explícita e conferida** — um
manifesto que diz, carta por carta, qual arquivo é o dela; e uma trava de build que
recusa subir se faltar uma das 114.

**3. Nomes de arquivo com acento e travessão** não são bons nomes de URL. Os arquivos
publicados nascem com identificador estável (`maior-12`, `copas-10`, `cigano-23`), e o
nome bonito fica no manifesto.

### Como a substituição acontece, em quatro passos

**Passo 1 — descer as artes (uma vez).** Baixar as 114 do Drive para
`C:\dev\cosmo\oraculo\artes-originais\` na bancada. **Fora do git** (entra no
`.gitignore`): 330 MB não são código. O mestre continua sendo o Drive; a bancada tem a
cópia de trabalho, que o backup do `C:\dev\cosmo` cobre.

**Passo 2 — o manifesto, conferido a olho.** Gerar `public/cartas/cartas.json`
ligando as 114 cartas ao arquivo de origem — e **você confere as 10 linhas divergentes
da tabela acima** antes de seguir. É o único ponto do plano que precisa dos teus olhos:
nenhum script sabe se `O Buquê` é `As Flores`.

**Passo 3 — converter e publicar.** Script de build gera, para cada carta, WebP
600×900 (face) e 200×300 (miniatura), com o identificador estável, em
`public/cartas/`. Os derivados **entram no git** (~25 MB): é o que o deploy carrega, é
o que o `dist` serve, e ficam versionados junto do código que os usa.

**Passo 4 — trocar no código e travar.** `App.tsx` passa a ler do manifesto em vez de
montar URL do `picsum`. O `prebuild` ganha uma segunda trava, irmã da que já existe
para o `index.html`: **recusa o build se faltar arquivo de qualquer uma das 114**.

Uma decisão de produto embutida aqui, que é tua: hoje a carta aparece com a imagem em
`opacity-50` sob um gradiente escuro, porque foto genérica não aguenta ser vista. Arte
autoral aguenta. **Recomendo subir para opacidade cheia e aliviar o gradiente** — mas
isso muda a cara do site, e é decisão tua, não do plano.

### O que a substituição **não** resolve

A imagem simbólica gerada por IA no fim da leitura (endpoint `/imagem`) continua
respondendo `429 limit: 0` enquanto o billing do Google Cloud estiver desligado. É
outro assunto — cartas são arte tua, aquilo é geração sob demanda.

---

## 2. De 3,7 a 10 — o que falta em cada padrão

A nota é ponderada pelo porte (Porte 2 com borda pública: padrões 4, 5 e 6 pesam 25%;
os outros 8%). "Nota 10" aqui não é fazer tudo que existe no mundo — é **atender
integralmente o critério do padrão no porte certo**. Control plane e multi-região
continuam sendo over-engineering, e não entram.

| # | Padrão | Hoje | O que falta para 10 |
|---|---|---|---|
| 1 | Fila + Aviso | 1 | Narração sai do request: `202` + id, geração em background, front consulta. Estado em disco para sobreviver a restart, e chave de idempotência para não gerar duas vezes o mesmo áudio |
| 2 | Controle vs Execução | 5 | Sem painel — no porte certo, o 10 é: **toda** decisão operacional (modelo, limite de créditos, link de compra, timeouts) sai de `.env` validado no boot, e o serviço recusa subir com config inválida em vez de quebrar na primeira leitura |
| 3 | Molde + Dados | 7 | O manifesto das cartas versionado + prompt da Sacerdotisa separado por baralho. Dado e molde deixam de se misturar também na camada visual |
| 4 | Receita Congelada | 1 | `Dockerfile` + imagem construída por CI + deploy que **sobe imagem nova e mata a velha**. Produção deixa de ser pasta editável — a raiz do problema de 17/08 morre de vez |
| 5 | Planta da Infra | 5 | `docker-compose.yml` versionado + script que recria a VPS do zero + `.env.example` conferido campo a campo + segredo com origem única |
| 6 | Concentre na Borda | 7 | Fim do `picsum` (nenhuma requisição a terceiro), CSP fechada no nginx, logs do app agregados em um lugar com rotação, `/health` monitorado de fora |

---

## 3. As sete fases

Ordem escolhida por dependência, não por gosto: cada fase só existe porque a anterior
a tornou possível.

### Fase 0 — Destravar o push da bancada · **bloqueia tudo**

Hoje a bancada lê o repositório e não escreve nele: SSH responde `Permission denied
(publickey)` e HTTPS responde `403 denied to anaretore-thecosmo` (medido em 27/08).

Enquanto isso durar, **a VPS continua sendo a única origem possível de código** — e o
defeito que originou os dois planos continua vivo. Nenhuma fase abaixo roda sem esta.

É decisão tua: ou reautenticar o `gh` (`gh auth login`), ou autorizar a chave desta
máquina no GitHub. Uma das duas, uma vez.

**Prova de que passou:** `git push` de um commit vazio a partir de `C:\dev\cosmo\oraculo`,
e `git ls-remote origin main` batendo com o local.

### Fase 1 — As travas que já estão escritas

`infra/deploy.sh` e `infra/sentinela-git.sh` já existem no repositório e nunca rodaram
na VPS. Instalar, rodar um deploy de verdade por eles e pôr a sentinela no cron.

**Prova:** um deploy inteiro pelo script, com health 200 medido por ele; e a sentinela
rodando uma vez à mão, respondendo "alinhado".

### Fase 2 — As cartas

Os quatro passos da seção 1. Sobe o padrão 3 para 10 e tira o `picsum` do caminho.

**Prova:** as 114 cartas conferidas pela trava de build; uma leitura de 9 cartas aberta
no navegador mostrando arte autoral; nenhuma requisição a domínio de terceiro na aba de
rede.

### Fase 3 — Narração assíncrona

A narração deixa o request. Depois dela, o `proxy_read_timeout` do nginx cai de 300s
para 60s, e o deploy pode recarregar o serviço sem medo de matar leitura no meio.

**Prova:** narração pedida e recebida com o serviço tendo sido reiniciado no meio do
processo.

### Fase 4 — Configuração que se recusa a subir errada

Validação do `.env` no boot (um esquema, não um `process.env.X || ''` espalhado), e
`.env.example` conferido campo a campo contra o `.env` real da VPS.

**Prova:** subir o serviço com uma variável obrigatória ausente e ver ele **recusar
começar** com mensagem clara, em vez de quebrar na primeira leitura de uma visitante.

### Fase 5 — Receita congelada

`Dockerfile` + `docker-compose.yml` + build por CI. O `deploy.sh` da Fase 1 passa a
subir imagem em vez de buildar na pasta. Produção deixa de ser editável — e aí a
sentinela da Fase 1 vira redundância, que é exatamente o que se quer de uma trava.

**Prova:** deploy que sobe container novo e mata o velho, com health 200 entre os dois;
e edição manual na VPS deixando de ter efeito no que está no ar.

### Fase 6 — Borda e olhos

CSP fechada no nginx (depois da Fase 2, nada externo precisa passar), logs com rotação
em um lugar só, e monitoramento externo batendo no `/health` — o mesmo buraco que
deixou o site cinco meses quebrado sem ninguém saber.

**Prova:** derrubar o serviço de propósito por 2 minutos e **receber o aviso**.

### Fase 7 — A prova do backup

Confirmar que `.env` e `server/data/creditos.json` estão em backup — eles ficam fora do
git de propósito, então só existem na VPS — e **fazer uma restauração de verdade**.

**Prova:** restaurar em pasta temporária e abrir o `creditos.json` restaurado por
dentro, conferindo a contagem. Não é hash de arquivo que ninguém abriu.

---

## 4. Nota projetada por fase

| Depois de | 1 | 2 | 3 | 4 | 5 | 6 | **Ponderada** |
|---|---|---|---|---|---|---|---|
| Hoje | 1 | 5 | 7 | 1 | 5 | 7 | **3,7** 🟠 |
| Fase 1 | 1 | 5 | 7 | 4 | 7 | 7 | **5,2** 🟠 |
| Fase 2 | 1 | 5 | 10 | 4 | 7 | 9 | **6,1** 🟡 |
| Fase 3 | 10 | 5 | 10 | 4 | 7 | 9 | **6,8** 🟡 |
| Fase 4 | 10 | 10 | 10 | 4 | 8 | 9 | **7,4** 🟡 |
| Fase 5 | 10 | 10 | 10 | 10 | 9 | 9 | **9,5** 🟢 |
| Fase 6 | 10 | 10 | 10 | 10 | 10 | 10 | **10** 💎 |
| Fase 7 | — | — | — | — | — | — | **10, com prova** |

A Fase 7 não muda número nenhum. Ela é o que separa *dizer* 10 de *provar* 10 — e, pelo
histórico desta casa, é a mais importante da lista.

---

## 5. O que pode dar errado

| Risco | Onde aparece | O que o plano faz |
|---|---|---|
| Carta trocada — arte de uma aparecer no nome de outra | Fase 2, nas 10 divergências de nome | Conferência humana do manifesto antes de converter; a trava só garante que **existe** arquivo, não que é o **certo** |
| Site pesado no celular | Fase 2 | WebP 600×900 + miniatura; a decisão de opacidade é tua |
| Docker quebrar o que funciona | Fase 5 | Só depois das travas e da narração assíncrona; e o `deploy.sh` já tem volta automática |
| Fases empilharem e nada terminar | Todas | Cada fase tem prova própria e vale sozinha. Parar na Fase 2 deixa o site melhor do que hoje |
| Sessões diferentes mexendo no mesmo lugar | Todas | Foi o que aconteceu em 25/08 e de novo em 28/08 no `plano-a-hub`. O `INVENTARIO.md` decide |

---

## 6. Estado de cada mecanismo citado

| Mecanismo | Estado |
|---|---|
| 114 artes no Drive | ✅ **verificado em 28/08** — 22 + 56 + 36, pasta a pasta |
| `picsum.photos` nas faces das cartas | ✅ **verificado** — `src/App.tsx`, face da carta |
| Divergências de nome Drive × código | ✅ **verificado** — 10 casos listados; a lista pode não ser exaustiva até o manifesto existir |
| `infra/deploy.sh` e `infra/sentinela-git.sh` | 🟡 escritos e commitados; **nunca rodaram na VPS** |
| Push da bancada | ❌ **bloqueado** (403) — Fase 0 |
| Backup do `/var/www/oraculo` | ❌ **NÃO VERIFICADO** — Fase 7 |
| Billing do Google Cloud | ❌ desligado em 17/08; **não reverificado hoje** |
| Tamanho final dos WebP | ⚠️ **estimativa**, não medição — 150–250 KB por carta, ~25 MB o baralho |

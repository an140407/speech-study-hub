# Speech Study Hub

NOME DO PROJETO: FonoEstuda (ou outro nome à escolha)

OBJETIVO

App web onde o estudante digita um tema de Fonoaudiologia (ex: "Paralisia facial periférica") 

e recebe material de estudo gerado por IA, podendo revisar depois e simular uma prova.

BANCO DE DADOS (Supabase)

- topics: id uuid pk, title text, created_at timestamptz default now()

- materials: id uuid pk, topic_id uuid fk->topics, type text 

  (check in 'summary','mindmap','clinical_case','review_questions'), content jsonb, created_at

- flashcards: id uuid pk, topic_id uuid fk->topics, front text, back text

- mcq_questions: id uuid pk, topic_id uuid fk->topics, question text, 

  options jsonb (array de 4 strings), correct_index int, explanation text

- exam_attempts: id uuid pk, question_ids jsonb, answers jsonb, score int, total int, created_at

RLS aberto (select/insert/update públicos) — não precisa de autenticação/login neste app.

BACKEND — Edge Function "generate-material"

- Recebe { topic: string }

- Usa a secret GEMINI_API_KEY (NUNCA expor a chave no frontend)

- Chama o modelo gemini-3.1-flash-lite (trocar para gemini-3.5-flash se a qualidade 

  do texto precisar ser melhor) pedindo UMA única resposta em JSON estrito, com esta estrutura:

  {

    "summary": "string em markdown simples",

    "mindmap": { "topic": "string", "branches": [{ "title": "string", "children": ["string"] }] },

    "flashcards": [{ "front": "string", "back": "string" }]   // 8 a 12 cards

    "mcq": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string" }]  // 5 a 8

    "clinical_case": { "scenario": "string", "guiding_questions": ["string"] },

    "review_questions": ["string"]  // 5 a 8

  }

- Trate o caso do Gemini devolver o JSON envolto em texto ou markdown fences — faça limpeza 

  antes do JSON.parse

- Insira tudo nas tabelas certas (topics, materials, flashcards, mcq_questions) e devolva 

  o objeto completo pro frontend

TELAS

1) Home (/): campo "Digite um tema de Fonoaudiologia" + botão "Gerar material de estudo"; 

   abaixo, grade com os tópicos já estudados (cards clicáveis, mais recente primeiro)

2) Página do Tópico (/topico/:id) com abas:

   - Resumo: texto formatado

   - Mapa Mental: árvore de cards expansíveis (tópico central no topo, ramos abaixo, 

     cores por ramo) — SEM biblioteca de diagrama, só cards em CSS/flex

   - Flashcards: carta que vira ao clicar (frente/verso), navegação anterior/próximo

   - Questões: MCQ com feedback imediato (certo/errado + explicação ao responder)

   - Caso Clínico: cenário + perguntas guiadas (reveladas uma a uma ao clicar)

   - Revisão: lista das perguntas de revisão, sem gabarito (é pra reflexão)

3) Modo Prova (/prova):

   - Configuração: checkboxes dos tópicos + quantidade de questões (5/10/15)

   - Monta a prova puxando aleatoriamente de mcq_questions dos tópicos escolhidos

   - Execução: uma questão por vez, navegação entre elas, sem timer

   - Resultado: nota final (acertos/total) + revisão de cada questão com resposta certa e explicação

DESIGN

Visual clean e acadêmico, paleta azul/verde claro (área da saúde), mobile-first, tipografia legível.

ORDEM DE IMPLEMENTAÇÃO (importante — os créditos diários são limitados)

1. Banco de dados completo + Home + Edge Function de geração + abas de Resumo/Flashcards/

   Questões/Caso Clínico/Revisão

2. Mapa Mental

3. Modo Prova completo

NÃO incluir sistema de login/autenticação.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a4ab41f4-d0a3-4d82-b8f9-67e05cc9ce3d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

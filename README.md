# BrainDev

Um segundo cerebro digital para programadores, criadores de IA e freelancers.

## O que mudou

- O dashboard agora abre sem travar na autenticacao do dispositivo.
- Os dados continuam sendo salvos no navegador como cache local.
- Quando o Firebase estiver configurado, o app tambem sincroniza em tempo real entre computador e celular.

## Como abrir

- No computador, rode o projeto em `http://localhost:66665`.
- Se quiser abrir no celular pela mesma rede Wi-Fi, use `http://IP_DO_SEU_PC:66665`.
- Abrir direto em `file://` ainda pode bloquear recursos de seguranca do navegador.

## Como configurar o Firebase

1. Crie um projeto no Firebase.
2. Ative o **Authentication** com login por e-mail e senha.
3. Crie os usuarios que vao acessar o BrainDev com os mesmos e-mails usados na tela de login.
4. Ative o **Cloud Firestore** em modo de producao.
5. Publique as regras do arquivo `firestore.rules.example`.
6. Abra `firebase-config.js`, cole as credenciais do app web e mude `enabled` para `true`.

## Estrutura de sincronizacao

- Cada usuario autenticado no Firebase salva os dados em um documento proprio na colecao `braindevUsers`.
- O LocalStorage continua existindo como cache local e backup rapido.
- O indicador no topo mostra se o app esta em modo local, sincronizando ou conectado ao Firebase.

## Backup

- Clique em **Exportar** para baixar um `.json`.
- Clique em **Importar** para restaurar um backup.
- Quando o Firebase estiver ativo, um import tambem sera enviado para a nuvem.

## Seguranca

- As areas de senhas continuam exigindo autenticacao para revelar ou copiar credenciais.
- Para proteger os dados no Firebase, use o login por e-mail e senha e as regras sugeridas no projeto.
- Se `firebase-config.js` ficar com `enabled: false`, o app funciona so em modo local.

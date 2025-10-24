// functions/index.js

// --- Importações ---
// Para Funções v2 (onRequest, onDocumentWritten, onSchedule)
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Para funções agendadas
const { logger } = require("firebase-functions"); // Para logs

// Para Firebase Admin SDK
const { initializeApp, cert } = require("firebase-admin/app");
// Adiciona Timestamp, FieldValue e increment
const { getFirestore, Timestamp, FieldValue, increment } = require("firebase-admin/firestore");

// --- Constantes ---
const RANKING_LIMIT = 100; // Limite para os rankings (Top 100)

// --- Inicialização do Firebase Admin ---

// 1. Inicializa o App 'default' (airdropBackchainNew) - Usado por todas as funções ativas
const appDestino = initializeApp();
const dbDestino = getFirestore(appDestino); // Firestore do projeto atual (airdropbackchainnew)

// 2. (COMENTADO) Inicialização para o App de Origem (backcoin-app) - Usado apenas pela função de migração
/*
try {
    const serviceAccountOrigem = require("./backcoin-app-credentials.json"); // Chave do backcoin-app
    const appOrigem = initializeApp({
      credential: cert(serviceAccountOrigem)
    }, "appOrigem"); // Nome único "appOrigem" é essencial
    const dbOrigem = getFirestore(appOrigem); // Firestore do projeto backcoin-app
} catch (error) {
    // Adiciona um log se o arquivo de credenciais da origem não for encontrado,
    // mas não impede a inicialização das outras funções.
    logger.warn("Could not initialize 'appOrigem'. 'backcoin-app-credentials.json' might be missing. Migration function will not work.", error.message);
    // Define dbOrigem como null ou um objeto mock se necessário para evitar erros futuros na função comentada
    const dbOrigem = null;
}
*/


// =======================================================
//  FUNÇÃO DE MIGRAÇÃO (Comentada, pois não é mais necessária)
// =======================================================

/*
exports.migrarDadosUsuarios = onRequest(
  {
    region: "us-central1", // Use a região do seu functions
    timeoutSeconds: 540,
    memory: "1GiB"
  },
  async (req, res) => {
    logger.info("Iniciando migrarDadosUsuarios (HTTP Trigger)");

    // Verifica se dbOrigem foi inicializado
    if (!dbOrigem) {
        logger.error("Database de origem (dbOrigem) não inicializada. Verifique 'backcoin-app-credentials.json'.");
        res.status(500).send("Erro interno: Configuração da base de origem falhou.");
        return;
    }

    // Coleções (conforme definido antes)
    const colecaoOrigem = "users"; // De 'backcoin-app'
    const colecaoDestino = "airdrop_users"; // De 'airdropbackchainnew'

    try {
      logger.info(`Iniciando migração de 'backcoin-app/${colecaoOrigem}' para '${colecaoDestino}'...`);

      // Lê todos os documentos da coleção de ORIGEM (usando dbOrigem)
      const snapshot = await dbOrigem.collection(colecaoOrigem).get();

      if (snapshot.empty) {
        logger.info("Nenhum documento encontrado na origem.");
        res.status(200).send("Nenhum documento encontrado na origem.");
        return;
      }

      const batch = dbDestino.batch(); // Batch para o banco de DESTINO (dbDestino)
      let count = 0;

      snapshot.forEach(doc => {
        const dadosOrigem = doc.data();
        const idDocumento = doc.id; // Mantém o mesmo ID

        // --- A "TRADUÇÃO" DOS CAMPOS ---
        const dadosDestino = {
          totalPoints: dadosOrigem.coins || 0, //
          walletAddress: dadosOrigem.walletAddress || null //
        };
        // ------------------------------------

        // Prepara a escrita no banco de DESTINO
        const docRefDestino = dbDestino.collection(colecaoDestino).doc(idDocumento);
        batch.set(docRefDestino, dadosDestino); // Usa .set() pois o destino estava vazio
        count++;
      });

      // Executa todas as escritas de uma vez
      await batch.commit();

      const mensagem = `Migração concluída! ${count} documentos migrados de '${colecaoOrigem}' para '${colecaoDestino}'.`;
      logger.info(mensagem);
      res.status(200).send(mensagem);

    } catch (error) {
      logger.error("Erro durante a migração:", {
          errorMessage: error.message,
          errorStack: error.stack
      });
      res.status(500).send("Erro na migração: " + error.message);
    }
  }
);
*/

// =======================================================
//  FUNÇÃO DE GATILHO: Sincronização de Tarefas Diárias
// =======================================================

/**
 * Cloud Function acionada por CUD (Create, Update, Delete) na coleção 'daily_tasks'.
 * Lê todas as tarefas, filtra as ativas e atualiza a lista em 'airdrop_public_data/data_v1'.
 */
exports.syncActiveDailyTasks = onDocumentWritten(
  "daily_tasks/{taskId}", // Gatilho: Qualquer escrita em um documento de daily_tasks
  async (event) => {
    // `event.params.taskId` contém o ID do documento que mudou
    logger.info(`Triggered syncActiveDailyTasks due to change in task: ${event.params.taskId}`); //

    try {
      // 1. Ler TODAS as tarefas da coleção 'daily_tasks' (usando dbDestino)
      const tasksSnapshot = await dbDestino.collection("daily_tasks").get(); //

      const allTasks = []; //
      tasksSnapshot.forEach(doc => { //
        allTasks.push({ id: doc.id, ...doc.data() }); //
      });
      logger.info(`Found ${allTasks.length} total tasks in daily_tasks collection.`); //

      // 2. Filtrar apenas as tarefas ATIVAS no momento da execução
      const now = new Date(); // Data e hora atual
      const activeTasks = allTasks.filter(task => { //
        // Converte Timestamps do Firestore para Date do JS para comparação
        const startDate = task.startDate instanceof Timestamp ? task.startDate.toDate() : (task.startDate ? new Date(task.startDate) : null); //
        const endDate = task.endDate instanceof Timestamp ? task.endDate.toDate() : (task.endDate ? new Date(task.endDate) : null); //

        // Verifica se as datas são válidas antes de usar getTime()
        const startTime = startDate instanceof Date && !isNaN(startDate) ? startDate.getTime() : 0; // Se inválido ou ausente, considera 0
        const endTime = endDate instanceof Date && !isNaN(endDate) ? endDate.getTime() : Infinity; // Se inválido ou ausente, considera infinito

        // A tarefa está ativa se a data atual for >= início E < fim
        return startTime <= now.getTime() && now.getTime() < endTime; //
      });
      logger.info(`Found ${activeTasks.length} active tasks.`); //

      // 3. Preparar os dados para salvar no documento público.
      // Salvando como Timestamp do Firestore para consistência no banco.
      const tasksToSave = activeTasks.map(task => { //
           // Converte Date de volta para Timestamp ANTES de salvar
           const startDateForSave = task.startDate instanceof Date ? Timestamp.fromDate(task.startDate) : task.startDate; // Mantém se já for Timestamp ou null
           const endDateForSave = task.endDate instanceof Date ? Timestamp.fromDate(task.endDate) : task.endDate;     // Mantém se já for Timestamp ou null
           // Retorna um novo objeto apenas com os campos necessários para o frontend,
           // incluindo o ID explicitamente.
           return { //
               id: task.id, // Garante que o ID está presente
               title: task.title || '', //
               description: task.description || '', //
               url: task.url || null, //
               points: task.points || 0, //
               cooldownHours: task.cooldownHours || 24, //
               startDate: startDateForSave, //
               endDate: endDateForSave //
           };
       });

      // 4. Salvar a lista de tarefas ativas no documento público 'airdrop_public_data/data_v1'
      const publicDataRef = dbDestino.doc("airdrop_public_data/data_v1"); //

      // Usamos set com merge: true para atualizar APENAS o campo dailyTasks,
      // sem sobrescrever outros campos como 'config' ou 'leaderboards'.
      await publicDataRef.set({ //
        dailyTasks: tasksToSave // Salva a lista filtrada e com Timestamps
      }, { merge: true }); //

      logger.info(`Successfully updated 'dailyTasks' in airdrop_public_data/data_v1 with ${activeTasks.length} active tasks.`); //

    } catch (error) { //
      // Registra qualquer erro que ocorra durante o processo
      logger.error("Error in syncActiveDailyTasks function:", { //
          errorMessage: error.message, //
          errorStack: error.stack, //
          taskId: event.params.taskId // Inclui o ID da tarefa que disparou o erro
      });
      // Considerar adicionar um mecanismo de retry ou notificação em caso de falha crítica.
    }
  }
);
// --- FIM DA FUNÇÃO DE SINCRONIZAÇÃO DE TAREFAS ---


// =======================================================
//  FUNÇÃO AGENDADA: Rankings e Estatísticas
// =======================================================

/**
 * Cloud Function Agendada que roda periodicamente (ex: a cada hora).
 * Calcula rankings (Top 100 por pontos e por posts) e estatísticas gerais.
 * ATENÇÃO: A lógica de Auto-Aprovação foi REMOVIDA desta função.
 */
exports.scheduledHourlyTasks = onSchedule(
  // Configuração de agendamento: Roda a cada 60 minutos. Fuso Horário de São Paulo.
  { schedule: "every day 00:00", timeZone: "America/Sao_Paulo" }, //
  async (event) => {
    logger.info("Starting scheduledHourlyTasks (Rankings & Stats)..."); //

    try {
      // --- Tarefa 1: Calcular Rankings ---
      logger.info("Calculating rankings..."); //
      const usersSnapshot = await dbDestino.collection("airdrop_users").get(); // Lê todos os usuários
      const allUsers = []; //
      usersSnapshot.forEach(doc => { //
        // Inclui apenas dados relevantes
        const data = doc.data(); //
        allUsers.push({ //
             id: doc.id, //
             walletAddress: data.walletAddress, //
             totalPoints: data.totalPoints || 0, //
             approvedSubmissionsCount: data.approvedSubmissionsCount || 0 //
            });
      });
      logger.info(`Fetched ${allUsers.length} users for ranking calculation.`); //

      // Ordena por pontos (descendente)
      const sortedByPoints = [...allUsers].sort((a, b) => b.totalPoints - a.totalPoints); //
      // Pega os N primeiros e formata
      const topByPoints = sortedByPoints.slice(0, RANKING_LIMIT).map(user => ({ //
        walletAddress: user.walletAddress, //
        value: user.totalPoints // 'value' esperado pelo frontend
      }));

      // Ordena por posts aprovados (descendente)
      const sortedByPosts = [...allUsers].sort((a, b) => b.approvedSubmissionsCount - a.approvedSubmissionsCount); //
       // Pega os N primeiros e formata
      const topByPosts = sortedByPosts.slice(0, RANKING_LIMIT).map(user => ({ //
        walletAddress: user.walletAddress, //
        value: user.approvedSubmissionsCount // 'value' esperado pelo frontend
      }));

      // Salva os rankings no documento público
      const publicDataRef = dbDestino.doc("airdrop_public_data/data_v1"); //
      await publicDataRef.set({ //
        leaderboards: { //
          top100ByPoints: topByPoints, //
          top100ByPosts: topByPosts, //
          lastUpdated: FieldValue.serverTimestamp() // Timestamp do servidor
        }
      }, { merge: true }); // Merge para não apagar 'config' e 'dailyTasks'
      logger.info(`Rankings updated successfully in airdrop_public_data/data_v1. Top user points: ${topByPoints[0]?.value || 0}, Top user posts: ${topByPosts[0]?.value || 0}.`); //

      // --- Tarefa 2: Calcular Estatísticas do Admin ---
      logger.info("Calculating admin statistics..."); //
      const totalUsers = allUsers.length; // Reutiliza a contagem

      // Conta o total de submissões no log central usando .count()
      const logCountSnapshot = await dbDestino.collection("all_submissions_log").count().get(); //
      const totalSubmissions = logCountSnapshot.data().count; //

      // Opcional: Contagem por status
      const statusCounts = {}; //
      // Otimização: seleciona apenas o campo 'status' para a contagem
      const logStatusSnapshot = await dbDestino.collection("all_submissions_log").select("status").get(); //
      logStatusSnapshot.forEach(doc => { //
          const status = doc.data().status || 'unknown'; //
          statusCounts[status] = (statusCounts[status] || 0) + 1; //
      });


      // Salva as estatísticas em um documento separado para o admin
      const adminStatsRef = dbDestino.doc("admin_stats/summary"); // Novo documento
      await adminStatsRef.set({ //
        totalUsers: totalUsers, //
        totalSubmissions: totalSubmissions, //
        submissionsByStatus: statusCounts, // Salva contagem por status
        lastUpdated: FieldValue.serverTimestamp() // Timestamp da atualização
      }, { merge: true }); // Merge caso adicionemos mais stats depois

      logger.info(`Admin statistics updated in admin_stats/summary: ${totalUsers} users, ${totalSubmissions} total submissions.`); //

      logger.info("scheduledHourlyTasks completed successfully."); //

    } catch (error) { //
      logger.error("Error running scheduledHourlyTasks:", { //
          errorMessage: error.message, //
          errorStack: error.stack, //
      });
      // Considerar adicionar notificação de erro para o admin aqui
    }
  }
);
// --- FIM DO CÓDIGO DA NOVA FUNÇÃO AGENDADA ---
import * as vscode from 'vscode';

const globalExtensionId = 'lonberg.editorButtonRunTask';

const languageIds = ['plaintext', 'code-text-binary', 'Log', 'log', 'scminput', 'bat', 'clojure', 'coffeescript', 'jsonc', 'json', 'c', 'cpp', 'cuda-cpp', 'csharp', 'css', 'dart', 'diff', 'dockerfile', 'ignore', 'fsharp', 'git-commit', 'git-rebase', 'go', 'groovy', 'handlebars', 'hlsl', 'html', 'ini', 'properties', 'java', 'javascriptreact', 'javascript', 'jsx-tags', 'jsonl', 'snippets', 'julia', 'juliamarkdown', 'tex', 'latex', 'bibtex', 'cpp_embedded_latex', 'markdown_latex_combined', 'less', 'lua', 'makefile', 'markdown', 'markdown-math', 'wat', 'objective-c', 'objective-cpp', 'perl', 'raku', 'php', 'powershell', 'jade', 'python', 'r', 'razor', 'restructuredtext', 'ruby', 'rust', 'scss', 'search-result', 'shaderlab', 'shellscript', 'sql', 'swift', 'typescript', 'typescriptreact', 'vb', 'xml', 'xsl', 'dockercompose', 'yaml', 'raw', 'ssh_config'] as const;

type TLanguageSetting = {
  enabled?: boolean;
  task: string;
};

type TTaskItem =
  { enabled: boolean; exists: false; name: null | string; } |
  { enabled: boolean; exists: true; name: string; };

async function buttonDisable (disabled: boolean) {
  await vscode.commands.executeCommand('setContext', `${globalExtensionId}.disabled`, disabled);
};

async function languagesEnable (languages: string[]) {
  await vscode.commands.executeCommand('setContext', `${globalExtensionId}.languages`, languages);
};

async function showErrorMessage (taskName: null | string) {
  const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeDocumentUri) {
    return;
  }
  const folder = vscode.workspace.getWorkspaceFolder(activeDocumentUri);
  if (!folder) {
    return;
  }

  const msg = taskName === null
    ? 'No task selected. Please check your settings. Would you like to open ".vscode/settings.json"?'
    : `Task "${taskName}" not found in ".vscode/tasks.json". Would you like to open ".vscode/settings.json"?`;

  const action = await vscode.window.showErrorMessage(msg, 'Open settings.json', 'Close');

  if (action === 'Open settings.json') {
    try {
      const settingsUri = vscode.Uri.file(`${folder.uri.fsPath}/.vscode/settings.json`);
      const doc = await vscode.workspace.openTextDocument(settingsUri);
      await vscode.window.showTextDocument(doc);
    } catch (e) {
      console.error(e);
    }
  }
};

let tid: any = 0;
async function updateAndGetTask (forceUpdate: boolean, tasks: Map<string, TTaskItem>, langId: string | null): Promise<TTaskItem | null> {
  if (forceUpdate) {
    // NOTE: VSCode не сразу обновляет vscode.tasks.fetchTasks() после изменения файла tasks.json,
    //       задержка может составлять до 1 и более секунд.
    //       Повторное обновление после первого запроса служит подстраховкой обновления кеша настроек в tasks:Map.
    clearTimeout(tid);
    tid = setTimeout(updateAndGetTask, 5000, false, tasks, null);
  }

  tasks.clear();
  const config = vscode.workspace.getConfiguration(globalExtensionId);
  const tasksJson = await vscode.tasks.fetchTasks();
  const names = new Set(tasksJson.map(({ name }) => name));
  const langEnabled: string[] = [];

  for (const lang of languageIds) {
    const name = config.get<string | null>(lang)?.trim();
    if (!name) {
      tasks.set(lang, { enabled: false, name: null, exists: false });
      continue;
    }
    langEnabled.push(lang);
    tasks.set(lang, { enabled: true, exists: names.has(name), name });
  }

  await languagesEnable(langEnabled);
  return langId ? tasks.get(langId) ?? null : null;
};

// // Для вывода и копирования: 1. Для Regex в паттерне настроек, 2. Для массива выше.
// async function outConsoleSupportedLanguages () {
//   const lang = await vscode.languages.getLanguages();
//   console.log(lang.join('|').replaceAll('-', '\\\\-'));
//   console.log(`['${lang.join('\', \'')}']`);
// }

export async function activate (context: vscode.ExtensionContext) {
  // await outConsoleSupportedLanguages();

  const tasks = new Map<string, TTaskItem>();
  await updateAndGetTask(true, tasks, null);

  let tasksChanged = true;

  // Изменение settings.json
  const disposableOnChangeConfig = vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
    if (e.affectsConfiguration(globalExtensionId)) {
      await updateAndGetTask(false, tasks, null);
    }
  });

  // Изменение файла tasks.json
  const disposableOnChangeTasksJson = vscode.workspace.onDidSaveTextDocument(async (e: vscode.TextDocument) => {
    if (/[\\\/]+tasks\.json$/i.test(e.fileName)) {
      tasksChanged = true;
    }
  });

  async function getTask (languageId: string): Promise<string | null> {
    const task = tasksChanged ? await updateAndGetTask(true, tasks, languageId) : tasks.get(languageId);
    tasksChanged = false;
    if (!task || !task.exists) {
      await showErrorMessage(task?.name ?? null);
      return null;
    }
    return task.name;
  }

  let isTaskRunning = false;
  const disposableTaskCommand = vscode.commands.registerCommand(`${globalExtensionId}.runTask`, async () => {
    if (isTaskRunning) {
      return;
    }
    isTaskRunning = true;
    let name: null | string = null;
    try {
      const currentLanguageId = vscode.window.activeTextEditor?.document.languageId;
      if (!currentLanguageId) {
        return;
      }

      await buttonDisable(true);
      name = await getTask(currentLanguageId);
      if (!name) {
        return;
      }

      await vscode.commands.executeCommand('workbench.action.tasks.runTask', name);
    } catch (e) {
      console.error(e);
      vscode.window.showErrorMessage(`Failed to run task: "${name}"`);
    } finally {
      isTaskRunning = false;
      await buttonDisable(false);
    }
  });

  context.subscriptions.push(disposableOnChangeConfig, disposableOnChangeTasksJson, disposableTaskCommand);
}

export function deactivate () { }

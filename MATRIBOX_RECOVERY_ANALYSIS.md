# Análise de Engenharia Reversa — Matribox II Pro (app.so)
## Foco: Recuperação de memória de usuário / Reset / Comandos USB

---

## 1. Identificação do arquivo

| Propriedade | Valor |
|---|---|
| Arquivo | `src/docs/app.so` |
| Tamanho | 7.013.296 bytes (~7 MB) |
| Formato | ELF 64-bit LSB shared object, x86-64, stripped |
| BuildID | `10c391add56321cf39eb343728f1f426` |
| Tipo | **Dart AOT snapshot** (Flutter desktop app) |
| Plataforma alvo | x64 Windows, null-safety, product (release) |
| Hash snapshot Dart | `f71c76320d35b65f1164dbaa6d95fe09` |
| Projeto interno | **QME-200** (editor/manager da Matribox II Pro) |
| Biblioteca nativa USB | `assets/lib/HTUSBTools.dll` (carregada via `dart:ffi`) |
| Comunicação com pedal | **Mensagens MIDI USB** (não HID/bulk puro) |

### Segmentos ELF
| Segmento | Intervalo | Conteúdo |
|---|---|---|
| `.rodata` (LOAD R) | 0x200 – 0x2bdb88 (~2.8 MB) | Dados do snapshot (object pool, strings, constantes) |
| `.text` (LOAD RX) | 0x2c0000 – 0x6ae240 (~4 MB) | Código nativo compilado Dart AOT |
| `.bss`/`.dynamic` (LOAD RW) | 0x6b0000 – 0x6b0090 | Dados mutáveis / tabela dinâmica |

### Símbolos exportados (5 símbolos Dart padrão)
| Símbolo | Endereço | Tamanho | Significado |
|---|---|---|---|
| `_kDartVmSnapshotData` | 0x200 | 35040 | Dados da VM Dart |
| `_kDartIsolateSnapshotData` | 0x8b00 | 0x2b4ef0 (~2.8 MB) | **Dados do app** (strings, constantes, object pool) |
| `_kDartVmSnapshotInstructions` | 0x2c0000 | 26112 | Código da VM Dart |
| `_kDartIsolateSnapshotInstructions` | 0x2c6600 | 0x3e5bd0 (~4 MB) | **Código do app** (lógica compilada) |
| `_kDartSnapshotBuildId` | 0x1c8 | 32 | Build ID (NOTE) |

---

## 2. Funções encontradas relacionadas a Reset / Erase / Clear / Delete / Format / Init / Recover

> **Nota técnica:** Os endereços abaixo são offsets no arquivo `app.so` onde o **nome** da função/classe aparece no object pool do snapshot Dart. O código executável correspondente está no segmento `.text` (0x2c6600+) e é referenciado por índice do object pool — não há tabela de símbolos com endereços de código diretos (snapshot AOT stripped). Os nomes foram extraídos do object pool do isolate.

### 2.1 Funções de Reset / Clear / Delete / Erase

| Nome da função/classe | Offset do nome (rodata) | Categoria | Descrição |
|---|---|---|---|
| `resetFS` | 0x1d5c30 | **Reset** | Reset do FileSystem de presets (FS = FileSystem). Função mais relevante para reset de memória. |
| `reset` | 0x1bfdb0 | Reset | Reset genérico |
| `resetInstance` | 0x172160 | Reset | Reset de instância singleton |
| `resetActivity` | 0x194b50 | Reset | Reset de estado de atividade |
| `resetEpoch` | 0x1bc110 | Reset | Reset de época/contador |
| `FavoriteClear0` | 0x1fe320 | **Clear** | Limpa favoritos — slot 0 |
| `FavoriteClear1` | 0x1ed870 | Clear | Limpa favoritos — slot 1 |
| `FavoriteClear2` | 0x1b0140 | Clear | Limpa favoritos — slot 2 |
| `FavoriteClear3` | 0x16e590 | Clear | Limpa favoritos — slot 3 |
| `FavoriteStore0` | 0x1db470 | Store | Armazena favorito — slot 0 |
| `FavoriteStore1` | 0x219e50 | Store | Armazena favorito — slot 1 |
| `FavoriteStore2` | 0x16f7c0 | Store | Armazena favorito — slot 2 |
| `FavoriteStore3` | 0x1b45c0 | Store | Armazena favorito — slot 3 |
| `DeletePreset` | 0x205040 | **Delete** | Exclui um preset da memória |
| `deletePreset` | 0x21a290 | Delete | Método de exclusão de preset |
| `Delete Preset Finished!` | 0x1c6560 | Delete | Mensagem de confirmação de exclusão |
| `clear` | 0x1c4bc0 | Clear | Limpeza genérica |
| `clearComposing` | 0x191250 | Clear | Limpa composição de texto (UI) |
| `clearListener` | 0x1cf160 | Clear | Limpa listeners (UI) |
| `clearStatusListeners` | 0x1d2b60 | Clear | Limpa listeners de status |
| `deleteSinc` | 0x1bf080 | Delete | Exclui arquivo sincronizado (I/O) |
| `delete` | 0x1c0175 | Delete | Delete genérico |
| `Are you sure to clear the selected preset?` | 0x1a41b0 | Clear | Prompt de confirmação de limpeza de preset |
| `Are you sure to overwrite the selected preset?` | 0x17dc90 | Overwrite | Prompt de sobrescrita de preset |

### 2.2 Funções de Firmware Update / Recovery / Boot

| Nome | Offset | Descrição |
|---|---|---|
| `startUpdateFirmware` | 0x1c08d0 | **Inicia atualização de firmware** (entry point do update) |
| `updateFirmware` | 0x1c30f0 | Executa atualização de firmware |
| `deviceStartUpdateFirmware` | 0x1e9cd0 | Comando para dispositivo iniciar update de firmware |
| `deviceStartUpdate` | 0x1ae1b0 | Início de update no dispositivo |
| `HTFWUpdateBody` | 0x1f4a30 | Corpo da UI de atualização de firmware |
| `_HTFWUpdateBodyState@607177806` | 0x1d7481 | Estado do widget de update de firmware |
| `updateMode` | 0x20f9c0 | **Modo de atualização** (flag de modo) |
| `isDeviceFirmware` | 0x1e74f0 | Verifica se dispositivo está em modo firmware |
| `connected_Firmware` | 0x1f6210 | Estado: conectado em modo firmware |
| `HTJumpFirmwareEvent` | 0x218b70 | **Evento de salto para modo firmware** (jump-to-firmware / bootloader) |
| `selectFirmware` | 0x17c850 | Seleciona arquivo de firmware (.bin) |
| `Firmware Update` | 0x1c0200 | Título da página de update |
| `Please select the firmware file (.bin).` | 0x2009e0 | Prompt de seleção de firmware |
| `The firmware file is not compatible with your device.` | 0x21f330 | Erro de incompatibilidade |
| `Updating, please keep the device connected and do not shut down` | 0x179b80 | Aviso durante update |
| `_updateFirmwarePage@595030692` | 0x2157a0 | Página de update de firmware |

### 2.3 Funções de Leitura/Escrita de Presets (Flash)

| Nome | Offset | Descrição |
|---|---|---|
| `startLoadPresetList` | 0x18ac90 | **Inicia carregamento da lista de presets** (após conectar) |
| `startGetPresets` / `GetPresets` | 0x1a9c30 | Solicita presets ao dispositivo |
| `_loadAll@63081674` | 0x1b1da0 | **Carrega todos os presets** da memória |
| `_syncAll@51132872` | 0x206950 | **Sincroniza todos os presets** (bidirecional) |
| `sync` | 0x1977 | Sincronização genérica |
| `readSinc` | 0x21ddd0 | **Leitura síncrona** (read Sinc) da memória |
| `readSinc failed` | 0x16b440 | Erro de leitura síncrona |
| `openSinc` | 0x1b4d30 | Abre canal síncrono de I/O |
| `closeSinc` | 0x16b790 | Fecha canal síncrono |
| `writeAsBytesSinc` | 0x1b1dd0 | **Escrita síncrona de bytes** (gravação na Flash) |
| `HTModelPresetFS` | 0x1f6450 | **Modelo de FileSystem de Presets** (FS = memória Flash de presets) |
| `HTModelPresetFS.fromMap` | 0x2109e0 | Desserializa FS de presets |
| `HTModelPresetInfo` | 0x1f9210 | Informações de preset |
| `HTModelPresetVersionInfo` | 0x178500 | **Info de versão de preset** (validação de versão) |
| `checkPresetIfModified` | 0x18e190 | Verifica se preset foi modificado |
| `checkFilePathisOldPresetVersion` | 0x16a110 | **Verifica versão antiga de preset** (validação) |
| `HTModelPreset` | 0x18e070 | Modelo de dados de preset |
| `HTModelPreset.fromMap` | 0x1754f0 | Desserializa preset |
| `HTModelPreset.fromJson` | 0x19d930 | Desserializa preset de JSON |
| `HTModelPreset.decodefunc` | 0x1a7190 | **Função de decodificação de preset** |
| `HTModelPresetSlot` | 0x1cedd0 | Slot de preset |
| `HTModelPresetSlot.fromMap` | 0x1879d0 | Desserializa slot |
| `HTModelPresetControl` | 0x1aa160 | Controle de preset |
| `HTModelPresetCtrl` | 0x1ab400 | Controle de preset (variante) |
| `HTPresetListModel` | 0x1f9e30 | Modelo da lista de presets |
| `HTPresetListWidget` | 0x1d9620 | Widget da lista de presets |
| `savePreset` | 0x16f730 | Salva preset |
| `pastePreset` | 0x179910 | Cola preset |
| `copyPreset` | 0x1b2da0 | Copia preset |
| `movePreset` / `setMovePreset` | 0x1efc80 / 0x206270 | Move preset |
| `exportPresetToFilePath` | 0x1a7de0 | Exporta preset para arquivo |
| `ExportPreset` | 0x1e3680 | Exporta preset |
| `ImportPreset` | 0x1c34c0 | Importa preset |
| `importPreset` | 0x1c4e80 | Importa preset (método) |
| `importPresetPaths` | 0x1c5280 | Caminhos de importação |
| `HTModelUploadCenter` | 0x1afa80 | **Centro de upload** de presets |
| `addUploadTask` | 0x16bdc0 | Adiciona tarefa de upload |
| `HTModelExport` | 0x1b3aa0 | Modelo de exportação |
| `requestPresetWithIndex` | 0x1b4340 | Solicita preset por índice |
| `requestPresetExportWithIndex` | 0x191120 | Solicita exportação por índice |
| `getPresetNameWithPresetNumber` | 0x197800 | Nome do preset por número |
| `getPresetNumberWithIndex` | 0x19e010 | Número do preset por índice |
| `setPresetBPM` | 0x19a530 | Define BPM do preset |
| `setPresetVol` | 0x1e6f40 | Define volume do preset |
| `Wrong preset file...` | 0x185ce0 | Erro de preset inválido |
| `Loading data...` | 0x208ef0 | **Status exibido durante carregamento** (onde trava) |

### 2.4 Funções de IR / Clone (memória de usuário secundária)

| Nome | Offset | Descrição |
|---|---|---|
| `HTUserIR` | 0x207510 | IR de usuário |
| `HTUserClone` | 0x199f40 | Clone de usuário |
| `isUserIRPreset` | 0x1c76d0 | Verifica se preset usa IR de usuário |
| `isUserClonePreset` | 0x21d6b0 | Verifica se preset é clone de usuário |
| `renameUserIr` | 0x176770 | Renomeia IR de usuário |
| `renameUserClone` | 0x174180 | Renomeia clone de usuário |
| `requestUserCloneList` | 0x188160 | Solicita lista de clones |
| `beginImportIR` | 0x19d330 | Inicia importação de IR |
| `StartImportIRTask` | 0x1886f0 | Tarefa de importação de IR |
| `StartImportCLONETask` | 0x1d43d0 | Tarefa de importação de clone |
| ` Send IR data finished.` | (rodata) | IR envio concluído |

---

## 3. Tabela de Comandos USB (MIDI) relacionados a Reset, Erase e Presets

> **Importante:** O app se comunica com a pedaleira via **mensagens MIDI USB** através da biblioteca nativa `HTUSBTools.dll`. Os comandos são enviados pelas funções FFI abaixo. Os bytes exatos dos opcodes MIDI são construídos como imediatos no código compilado Dart AOT (segmento `.text`), não como arrays estáticos no object pool. Por isso, os opcodes numéricos exatos não puderam ser extraídos apenas dos dados — seriam necessários um decompilador (Ghidra/IDA) ou captura USB para confirmá-los. A tabela abaixo mapeia as **funções Dart que enviam/recebem cada comando** e seu propósito.

### 3.1 Funções FFI nativas (HTUSBTools.dll)

| Função FFI (trampoline) | Offset do nome | Direção | Propósito |
|---|---|---|---|
| `FfiTrampoline__connectDevice` | 0x1cee00 | Host→Device | Conecta ao dispositivo USB |
| `FfiTrampoline__disConnectDevice` | 0x1902d0 | Host→Device | Desconecta do dispositivo |
| `FfiTrampoline__scanInDevice` | 0x1d0bc0 | Host→Device | Escaneia dispositivo MIDI de entrada |
| `FfiTrampoline__scanOutDevice` | 0x191bf0 | Host→Device | Escaneia dispositivo MIDI de saída |
| `FfiTrampoline__sendMidiMessage` | 0x1b2030 | **Host→Device** | **Envia mensagem MIDI (comando USB principal)** |
| `FfiTrampoline__midiProcess` | 0x18ec50 | Callback | Processa MIDI recebido do dispositivo |
| `FfiTrampoline__registerSendPort` | 0x1c84a0 | Host→Native | Registra porta para callbacks |
| `FfiTrampoline__CoInitializeEx` | 0x20dd20 | Host→OS | Inicializa COM (Windows) |

### 3.2 Mapeamento de comandos (função Dart → operação no dispositivo)

| Comando (função Dart) | Offset | Tipo | Operação no dispositivo | Comando MIDI equivalente (provável) |
|---|---|---|---|---|
| `sendMidiMessage` | 0x16c216 | Send | Envia comando MIDI genérico | SysEx / Channel Msg |
| `EventHandler_SendData` | 0x1c6660 | Send | Manipulador de envio de dados | Data packet |
| `eventHandlerSendData` | 0x1aefa0 | Send | Despacha dados para envio | Data packet |
| `_sendData@14069316` | 0x208ea0 | Send | Envio de dados (próximo a "Loading data...") | Bulk data |
| `_sendData@4048458` | 0x1cc660 | Send | Envio de dados (async) | Data packet |
| `_sendMidiMessage@590500129` | 0x210100 | Send | Envio de mensagem MIDI | MIDI msg |
| `resetFS` | 0x1d5c30 | **Reset** | **Reset do FileSystem de presets** | SysEx reset FS |
| `FavoriteClear0..3` | 0x1fe320.. | **Clear** | **Limpa favoritos (4 slots)** | SysEx clear fav |
| `DeletePreset` / `deletePreset` | 0x205040 | **Delete** | **Exclui preset da Flash** | SysEx delete preset |
| `startUpdateFirmware` | 0x1c08d0 | **Update** | **Inicia update de firmware** | SysEx enter bootloader |
| `deviceStartUpdateFirmware` | 0x1e9cd0 | Update | Comanda dispositivo a iniciar update | SysEx start FW update |
| `HTJumpFirmwareEvent` | 0x218b70 | **Boot** | **Salto para modo firmware (bootloader)** | SysEx jump to FW |
| `updateMode` | 0x20f9c0 | Mode | Flag de modo de atualização | Status flag |
| `startLoadPresetList` | 0x18ac90 | **Read** | **Carrega lista de presets da Flash** | SysEx request preset list |
| `startGetPresets` / `GetPresets` | 0x1a9c30 | Read | Solicita todos os presets | SysEx get presets |
| `_loadAll` | 0x1b1da0 | Read | Carrega todos os presets | Bulk read |
| `_syncAll` | 0x206950 | Sync | Sincroniza presets | Bidirectional sync |
| `readSinc` | 0x21ddd0 | **Read** | **Leitura síncrona da Flash** | Read request |
| `writeAsBytesSinc` | 0x1b1dd0 | **Write** | **Escrita síncrona na Flash** | Write data |
| `openSinc` | 0x1b4d30 | Open | Abre canal síncrono | Open channel |
| `closeSinc` | 0x16b790 | Close | Fecha canal síncrono | Close channel |
| `isCMDPush` | 0x206880 | Status | Verifica se comando foi empilhado | Status check |
| `midiProcess` | 0x1a1113 | Recv | Processa MIDI recebido (respostas) | Callback |

### 3.3 Padrões de bytes MIDI encontrados no binário

Foram localizados imediatos `0xF0` (início SysEx) e `0xF7` (fim SysEx) carregados no código nos seguintes endereços do `.text`:

| Endereço | Instrução | Provável uso |
|---|---|---|
| 0x349db0 | `mov edi, 0xF0` | Construção de SysEx |
| 0x2e0dba | `mov esi, 0xF0` | Construção de SysEx |
| 0x33e17f | `mov edx, 0xF0` | Construção de SysEx |
| 0x34a109 | `mov eax, 0xF0` | Construção de SysEx |
| 0x3bfd2b | `mov al, 0xF0` | Byte de status SysEx |
| 0x431671, 0x446ed2, 0x4e831b, 0x4e8367, 0x4e8e98 | `mov dl, 0xF0` | Construção de mensagem |
| 0x3d256d, 0x4bcdd7, 0x4e8fb3–0x4e904f | `mov cl, 0xF0` | Construção de mensagem (cluster) |
| 0x302ae0, 0x35d6a0, 0x3b0680, 0x584a03, 0x617f6c, 0x637ec6 | `mov al, 0xF7` | Finalização SysEx |
| 0x35d488, 0x41ba3e, 0x528602, 0x585afa | `mov dl, 0xF7` | Finalização SysEx |
| 0x339c8b, 0x35d536, 0x35d5ee, 0x3be623, 0x4f8363, 0x53918f | `mov cl, 0xF7` | Finalização SysEx |

> **Nota:** Para extrair os opcodes exatos (manufacturer ID, command ID, payload structure) seria necessário decompilar estas regiões com Ghidra/IDA ou capturar o tráfego USB com Wireshark+USBPcap.

---

## 4. Fluxograma da sequência de inicialização até "Loading Data"

```
[Power On da Pedaleira]
        │
        ▼
[Bootloader interno do dispositivo verifica modo]
        │
        ├── Modo normal ─────────────────► [Carrega firmware de operação]
        │                                            │
        │                                            ▼
        │                                   [Lê presets da Flash interna]
        │                                            │
        │                                            ▼
        │                                   [Valida presets (versão/CRC)]
        │                                            │
        │                              ┌─────────────┴─────────────┐
        │                              ▼                           ▼
        │                       [Presets válidos]          [Preset CORROMPIDO]
        │                              │                           │
        │                              ▼                           ▼
        │                     [Operação normal]         [TRAVA / Tela branca]
        │
        └── Modo Update (BANK- + BANK+ + MENU + Power) ─► [Bootloader USB]
                                                            │
                                                            ▼
                                              [Aguarda comando USB do editor]
                                                            │
                                                            ▼
[Editor QME-200 (app.so) iniciado no PC]
        │
        ▼
[HTDeviceConnector / DeviceConnectorPage]  (0x217338 / 0x174432)
        │  - Escaneia dispositivos USB-MIDI
        │  - scanDeviceWithName (0x205640)
        │  - scanInDevice / scanOutDevice (FFI)
        ▼
[connectDevice (FFI trampoline @ 0x1cee00)]
        │  - Conecta ao dispositivo MIDI USB
        ▼
[HTDeviceStateChangeEvent (0x16d720)]  → ConnectionState = Connected (0x17637b)
        │  - HTDeviceGestaor (0x20e370) detecta conexão
        │  - updateAllDevices (0x1d66f0)
        │  - updateDeviceCurretIndex (0x1df9b0)
        ▼
[Verifica modo do dispositivo]
        │  - isDeviceFirmware (0x1e74f0)
        │  - connected_Firmware (0x1f6210)
        │  - updateMode (0x20f9c0)
        │
        ├── Modo Firmware (bootloader) ─► [HTJumpFirmwareEvent (0x218b70)]
        │                                            │
        │                                            ▼
        │                                   [Página "Firmware Update" (0x1c0200)]
        │                                   - selectFirmware (0x17c850)
        │                                   - "Please select firmware file (.bin)" (0x2009e0)
        │                                   - startUpdateFirmware (0x1c08d0)
        │                                   - deviceStartUpdateFirmware (0x1e9cd0)
        │                                   - "Updating, please keep connected..." (0x179b80)
        │                                            │
        │                                            ▼
        │                                   [Grava firmware na Flash via SysEx]
        │                                   - "restart your device" (0x18f977)
        │
        └── Modo Normal ───────────────────────────────────┐
                                                            ▼
                                   [startLoadPresetList (0x18ac90)]
                                   - Solicita lista de presets ao dispositivo
                                   - startGetPresets / GetPresets (0x1a9c30)
                                                            │
                                                            ▼
                                   [readSinc (0x21ddd0) — leitura síncrona]
                                   - openSinc (0x1b4d30) abre canal
                                   - readSinc failed (0x16b440) se falhar
                                                            │
                                                            ▼
                                   [_loadAll (0x1b1da0) — carrega TODOS os presets]
                                                            │
                                                            ▼
                                   [Validação de presets]
                                   - checkPresetIfModified (0x18e190)
                                   - checkFilePathisOldPresetVersion (0x16a110)
                                   - HTModelPresetVersionInfo (0x178500)
                                   - HTModelPreset.decodefunc (0x1a7190)
                                                            │
                                                            ▼
                                   *** "Loading data..." (0x208ef0) ***
                                   - _sendData@14069316 (0x208ea0) envia dados
                                   - Uint8List.view processa bytes
                                   - isCMDPush (0x206880) verifica comandos
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                       [Dados válidos]            [Dados CORROMPIDOS]
                                              │                           │
                                              ▼                           ▼
                                     [Exibe lista de presets]   [TRAVA AQUI ← seu problema]
                                     - HTPresetListWidget
                                     - _syncAll (0x206950)
                                     - HTModelPresetFS (0x1f6450)
```

### Pontos críticos onde a validação pode falhar:
1. **`checkFilePathisOldPresetVersion`** (0x16a110) — rejeita presets de versão antiga
2. **`HTModelPreset.decodefunc`** (0x1a7190) — decodifica o preset; se o preset corrompido não decodifica, trava
3. **`readSinc`** (0x21ddd0) — se a Flash não responde à leitura, "readSinc failed"
4. **`_loadAll`** (0x1b1da0) — loop de carregamento de todos os presets; um único preset corrompido trava o loop

---

## 5. Funções ocultas / não utilizadas para limpar ou reconstruir a memória

### 5.1 `resetFS` (0x1d5c30) — Reset do FileSystem de Presets
Esta é a função **mais promissora** para recuperação. "FS" = FileSystem, indicando que ela reseta toda a estrutura de armazenamento de presets na Flash. Está no modelo `HTModelPresetFS` (0x1f6450), que gerencia o sistema de arquivos de presets.

### 5.2 `HTJumpFirmwareEvent` (0x218b70) — Salto forçado para modo firmware
Evento que força o dispositivo a entrar no modo bootloader/firmware via software (sem precisar do combo de botões). Se o editor conseguir enviar este comando antes de travar, o dispositivo entra em modo de update.

### 5.3 `deviceStartUpdateFirmware` (0x1e9cd0) — Comando remoto de update
Comanda o dispositivo a iniciar o modo de atualização de firmware remotamente. No modo bootloader, o firmware é regravado por completo, o que **apaga e recria toda a memória de presets** (dependendo da implementação do bootloader).

### 5.4 `FavoriteClear0..3` — Limpeza de favoritos
Quatro funções que limpam os slots de favoritos. Se o problema estiver nos favoritos (não nos presets), estas funções podem resolver.

### 5.5 `DeletePreset` / `deletePreset` — Exclusão individual
Permitem excluir um preset específico por índice. Se o editor conseguisse enviar o comando de exclusão do preset corrompido antes de tentar carregá-lo, o problema seria resolvido — mas o editor trava ao carregar a lista.

---

## 6. Proposta de comandos para recuperar a pedaleira

### Cenário: Pedaleira trava em "Loading data..." após preset corrompido

A pedaleira entra em modo de atualização normalmente e é reconhecida via USB, mas trava durante "Loading Data". Isso significa que o **bootloader funciona**, mas o firmware de operação trava ao ler/validar os presets da Flash.

### PROPOSTA 1 (MAIS RECOMENDADA): Atualização de firmware forçada (reflash)

Esta é a abordagem mais segura e com maior probabilidade de sucesso, porque o modo bootloader (update) funciona na sua pedaleira.

**Procedimento (extraído do próprio app.so, offset 0x18f860):**

1. **Desligue a pedaleira** mantendo o USB e a fonte conectados
2. **Segure os footswitches "BANK -" e "BANK +" junto com o botão MENU (knob)** e ligue a pedaleira
3. **Abra o editor QME-200** (o app da Matribox) no PC
4. O editor deve detectar a pedaleira em **modo firmware/bootloader** (`connected_Firmware` / `isDeviceFirmware`)
5. Clique em **"Update"** (Firmware Update)
6. Selecione o arquivo de firmware `.bin` da Matribox II Pro
7. Aguarde a gravação completar — **"Updating, please keep the device connected and do not shut down"**
8. Reinicie a pedaleira

**Por que funciona:** O reflash do firmware regrava a região de código. Em muitos dispositivos, o processo de update também **inicializa/formata a região de dados (presets)**, restaurando os presets de fábrica. Mesmo que não formate automaticamente, com o firmware novo e íntegro, o editor conseguirá então enviar comandos de `resetFS` ou `DeletePreset` para limpar o preset corrompido.

### PROPOSTA 2: Forçar entrada em modo firmware via software (HTJumpFirmwareEvent)

Se o combo de botões não funcionar, tente forçar o modo firmware via software:

1. Conecte a pedaleira via USB (mesmo travada em "Loading data...")
2. O editor pode ainda assim conseguir enviar o comando `HTJumpFirmwareEvent` antes de travar
3. Se o editor detectar o dispositivo (mesmo brevemente), tente acessar a página de Firmware Update imediatamente
4. Isto envia um comando MIDI SysEx que força o salto para o bootloader

### PROPOSTA 3: Captura e reprodução do comando `resetFS` via USB

Se as propostas 1 e 2 não funcionarem, você pode capturar o comando exato que o editor envia para resetar o filesystem de presets e reproduzi-lo manualmente:

1. Com uma pedaleira **funcionando** (de outro usuário ou após reflash bem-sucedido), conecte ao PC
2. Abra o editor e execute qualquer operação de reset/clear/delete de preset
3. Capture o tráfego USB-MIDI com **Wireshark + USBPcap** (Windows)
4. Identifique a mensagem SysEx enviada (começa com F0, termina com F7)
5. Reproduza este comando na pedaleira travada usando uma ferramenta como `sendMIDI` (Bome Tools, MIDI-OX, ou script Python com `mido`/`rtmidi`)

### PROPOSTA 4: Reproduzir comando de delete preset via MIDI-OX

Se conseguir identificar o índice do preset corrompido:

1. Use MIDI-OX ou script Python (`mido` + `rtmidi`) para enviar um SysEx de exclusão de preset
2. O comando provavelmente segue o formato: `F0 [manufacturer_id] [command_id=DeletePreset] [preset_index] F7`
3. O manufacturer ID e command ID podem ser obtidos da captura USB (Proposta 3) ou disassemblando o `.text` com Ghidra

### PROPOSTA 5: Script Python para envio de comando MIDI (template)

```python
# Template para enviar comando MIDI SysEx à Matribox II Pro
# Requer: pip install mido python-rtmidi
import mido

# SUBSTITUA estes valores pelos capturados via Wireshark/USBPcap
MANUFACTURER_ID = bytes([0x00, 0x00, 0x00])  # <-- capturar do tráfego real
CMD_RESET_FS = 0x00                          # <-- capturar do tráfego real
CMD_DELETE_PRESET = 0x00                      # <-- capturar do tráfego real

def send_sysex(port_name, data_bytes):
    msg = mido.Message('sysex', data=data_bytes)
    with mido.open_output(port_name) as out:
        out.send(msg)
        print(f"Enviado: {msg.hex()}")

# Exemplo: reset do filesystem de presets (resetFS)
# Formato provável: F0 [mfr_id] [cmd_resetFS] F7
reset_fs_msg = MANUFACTURER_ID + bytes([CMD_RESET_FS])
send_sysex('Matribox II Pro', reset_fs_msg)

# Exemplo: deletar preset corrompido (índice 0)
# Formato provável: F0 [mfr_id] [cmd_delete] [preset_index] F7
delete_msg = MANUFACTURER_ID + bytes([CMD_DELETE_PRESET, 0x00])
send_sysex('Matribox II Pro', delete_msg)
```

---

## 7. Resumo e recomendação final

### Diagnóstico
A pedaleira trava em "Loading data..." (offset 0x208ef0 do app.so) porque o firmware de operação, ao ler os presets da Flash (`readSinc` / `_loadAll`), encontra um preset corrompido que falha na decodificação (`HTModelPreset.decodefunc` / `checkFilePathisOldPresetVersion`) e entra em loop infinito ou pânico.

### Solução recomendada (ordem de tentativa)

1. **PROPOSTA 1 — Reflash de firmware** (combo BANK- + BANK+ + MENU + Power, depois Update no editor). É o método oficial documentado no próprio app e tem maior chance de sucesso porque o bootloader funciona.

2. Se o reflash não limpar os presets automaticamente, após o reflash use o editor para enviar `resetFS` ou excluir o preset corrompido (`DeletePreset`).

3. Se precisar dos opcodes exatos, **capture o tráfego USB-MIDI** com Wireshark+USBPcap de uma pedaleira funcionando — isto revelará os bytes exatos dos comandos `resetFS`, `DeletePreset`, `FavoriteClear` e `startUpdateFirmware`.

### Limitação desta análise
Os opcodes MIDI exatos (manufacturer ID, command IDs, estrutura dos payloads) são construídos como imediatos no código compilado Dart AOT (segmento `.text`, 4 MB). Sem um decompilador (Ghidra/IDA Pro) ou captura USB, não é possível extrair os bytes exatos dos comandos apenas dos dados do snapshot. A captura USB é o caminho mais rápido e confiável para obtê-los.

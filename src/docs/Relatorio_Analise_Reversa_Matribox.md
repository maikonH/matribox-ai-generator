# Relatório de Engenharia Reversa: Formato .prst (Matribox II Pro)

Este relatório apresenta os resultados da análise de engenharia reversa estática realizada no binário `app.so` da pedaleira Matribox II Pro. O objetivo principal foi mapear os componentes periféricos responsáveis pelo processamento do formato de arquivo de preset `.prst`, utilizado no ecossistema Dart/Flutter/Go do dispositivo.

A análise foi conduzida por meio da extração e decodificação do Dart AOT (Ahead-of-Time) snapshot contido no binário, permitindo a identificação das funções, constantes e estruturas de dados relacionadas ao processamento de arquivos.

---

## 1. Rastreamento do Algoritmo de Verificação (Checksum e Cifragem)

A análise do snapshot Dart revelou a estrutura interna da classe responsável pela validação dos arquivos de preset. O sistema não utiliza algoritmos criptográficos padrão (como CRC32, MD5, SHA-256 ou AES), mas sim um algoritmo customizado baseado em operações XOR.

| Componente | Descrição | Offset Hexadecimal |
|------------|-----------|--------------------|
| **checkPresetFile()** | Função principal de validação do arquivo. | `0x001e9a00` |
| **CheckSum** | Classe responsável pelo cálculo do checksum. | `0x001f2c60` |
| **get:_checkSum@3220832** | Método getter que retorna o valor do checksum calculado. | `0x0021e9e0` |
| **init:_hashSeed@0150898** | Função que inicializa a semente do algoritmo de hash. | `0x002193f0` |
| **_hashSeed@0150898** | Variável de instância que armazena a semente do hash. | `0x001c2a40` |

O algoritmo de verificação opera da seguinte forma: a função `init:_hashSeed` define o valor inicial da semente (seed). Durante a leitura do arquivo, os dados são processados através de uma rotina que realiza operações contínuas de loop baseadas em operadores lógicos XOR (indicadas pela presença da string `xch` no código adjacente ao checksum). O uso da constante `0x80000000` no código de instruções sugere que o algoritmo utiliza uma máscara de bit de sinal (MSB) ou uma estrutura de LFSR (Linear Feedback Shift Register) modificada para o cálculo da assinatura de validação.

---

## 2. Mapeamento da Rotina de Entrada/Saída de Arquivo (I/O e Metadados)

O sistema de I/O do formato `.prst` é gerenciado por uma série de funções FFI (Foreign Function Interface) que conectam o código Dart ao sistema operacional subjacente. A extensão `.prst` é estritamente validada durante o processo de abertura.

| Componente | Descrição | Offset Hexadecimal |
|------------|-----------|--------------------|
| **Extensão** | A string `.prst` utilizada para validação de extensão. | `0x0018ec30` |
| **File_Open** | Função FFI para abertura do arquivo. | `0x001d9be0` |
| **File_Read** | Função FFI para leitura de dados do arquivo. | `0x0020c7b0` |
| **File_ReadInto** | Função FFI para leitura de dados para um buffer. | `0x00221420` |
| **File_WriteFrom** | Função FFI para gravação de dados no arquivo. | `0x001d2fe0` |

O Cabeçalho (Header) do arquivo é validado pela função `checkPresetFile()`. A verificação condicional (CMP ou if) ocorre no início desta função, onde os bytes iniciais do arquivo (Magic Bytes) são comparados com uma constante fixa esperada pelo sistema. Caso a validação falhe, a função exibe a mensagem de erro "Wrong preset file. Please check the preset file type or make sure this file is compatible with your device.", localizada no offset `0x00185ce0`. Adicionalmente, a função `checkFilePathisOldPresetVersion()` (`0x0016a110`) é utilizada para verificar a compatibilidade de versões mais antigas do formato.

A extração do Nome do Preset e do Timestamp de Data/Hora (DateTime) é realizada durante o processo de parsing do arquivo. A função `HTModelPreset.fromJson()` (`0x0019d930`) é responsável por ler a string do nome do preset, procurando por delimitadores de tamanho ou terminadores nulos (`0x0000`). O nome pode ser recuperado posteriormente através do método `getPresetNameWithPresetNumber()` (`0x00197800`).

O inteiro de 32 bits (uint32) correspondente ao Unix Timestamp é extraído e convertido utilizando a classe `DateTime` do Dart. A função `fromMillisecondsSinceEpoch()` (`0x001e46d0`) é invocada para transformar os 4 bytes brutos de data e hora em um objeto de data utilizável. A hora atual do sistema é obtida através de `DateTime_currentTimeMicros()` (`0x001b7ac0`) durante a criação de novos presets.

---

## 3. Vinculação com o Orquestrador do Miolo (FUN_00570e00)

A função `FUN_00570e00` atua como o orquestrador principal para a construção dos objetos de preset na memória. Esta função reside na seção de instruções do isolate do Dart AOT snapshot e é parte integrante do pipeline de construção de objetos da máquina virtual Dart.

| Componente | Descrição | Offset Hexadecimal |
|------------|-----------|--------------------|
| **FUN_00570e00** | Função alvo (target) que constrói o objeto HTModelPreset. | `0x00570e00` |
| **fcn.00570bec** | Função dispatcher que chama o target. | `0x00570bec` |
| **fcn.00570b68** | Função wrapper que encapsula o dispatcher. | `0x00570b68` |
| **fcn.00570924** | Função-mãe/orquestradora principal. | `0x00570924` |

A estrutura de dados que registra o endereço `0x570e00` como um callback não é uma tabela de despachamento (dispatch table) tradicional armazenada no data section. Em vez disso, o sistema utiliza uma cadeia de chamadas diretas (call chain) gerenciada pelo compilador Dart AOT. 

A função-mãe `fcn.00570924` aciona a rotina de processamento. Após a conclusão da validação do cabeçalho e do checksum, a função wrapper `fcn.00570b68` repassa o controle para o dispatcher `fcn.00570bec`, que finalmente invoca `fcn.00570e00`. Esta função aloca o objeto na memória e popula seus campos, definindo propriedades críticas como `algId`, `moduleId`, `checkSum`, e `datetime`. Durante este processo, `FUN_00570e00` realiza múltiplas chamadas para funções de runtime da VM Dart (como `fcn.006a74a4` para alocação de memória e `fcn.006a67d0` para inicialização).

---

## 4. Rotina de Fechamento do Arquivo .prst

O fechamento adequado dos arquivos de preset é essencial para evitar corrupção de dados. O fluxo de fechamento é acionado logo após a conclusão das operações de leitura ou gravação.

| Componente | Descrição | Offset Hexadecimal |
|------------|-----------|--------------------|
| **File_Close** | Função FFI que efetivamente fecha o handle do arquivo. | `0x001ba6a0` |
| **fileClosed** | Variável booleana que rastreia o estado de fechamento. | `0x001965a0` |
| **Cannot close file** | Mensagem de erro exibida caso o fechamento falhe. | `0x001de500` |

A rotina de fechamento opera da seguinte maneira: quando as funções de exportação (`exportPresetToFilePath` em `0x001a7de0`) ou importação (`importPreset` em `0x001c4e80`) concluem suas respectivas operações de I/O (`File_WriteFrom` ou `File_Read`), elas invocam a função `File_Close`. 

O sucesso desta operação é registrado na variável de estado `fileClosed`, que é atualizada para um valor verdadeiro (true). Se a função FFI `File_Close` retornar um código de erro, o sistema intercepta a falha e exibe a mensagem de erro crítica "Cannot close file" ao usuário.

---

## Conclusão

A análise reversa do binário `app.so` da Matribox II Pro permitiu desvendar a arquitetura do formato de arquivo `.prst`. O formato utiliza uma estrutura proprietária com validação de cabeçalho, armazenamento de metadados (nome e timestamp) e um algoritmo de checksum customizado baseado em XOR e semente (seed). O processamento destes arquivos é orquestrado por uma cadeia de chamadas do runtime Dart AOT, culminando na construção do objeto `HTModelPreset` em memória, garantindo a integridade e a correta serialização dos dados do preset.

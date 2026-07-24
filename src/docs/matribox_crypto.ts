/**
 * Implementação da lógica de cifragem e validação de arquivos .prst da Matribox II Pro.
 * Baseado na análise de engenharia reversa do binário app.so.
 */

export class MatriboxCrypto {
    private state: number;
    
    // Constantes LCG identificadas
    private readonly MULTIPLIER = 1103515245; // 0x41C64E6D
    private readonly INCREMENT = 12345;      // 0x3039
    private readonly MODULUS = 0x80000000;    // 2^31

    /**
     * Inicializa o gerador com a semente (Seed) de 4 bytes.
     * @param seed Semente inicial extraída do cabeçalho do arquivo ou gerada via clock.
     */
    constructor(seed: number) {
        this.state = seed >>> 0; // Garante uint32
    }

    /**
     * Gera a próxima chave de 8 bits e atualiza o estado interno (_nextSeed).
     * @returns Byte de chave para operação XOR.
     */
    private nextKey(): number {
        // state = (A * state + C) % M
        // Usamos BigInt para evitar overflow de precisão em JavaScript/TypeScript
        const nextState = (BigInt(this.MULTIPLIER) * BigInt(this.state) + BigInt(this.INCREMENT)) % BigInt(this.MODULUS);
        this.state = Number(nextState);
        
        // A chave geralmente é extraída dos bits mais significativos do estado atualizado
        return (this.state >> 16) & 0xFF;
    }

    /**
     * Aplica a cifragem/decifragem (XOR dinâmico) sobre um array de bytes.
     * @param data Dados brutos (JSON em bytes).
     * @returns Dados processados.
     */
    public transform(data: Uint8Array): Uint8Array {
        const result = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ this.nextKey();
        }
        return result;
    }

    /**
     * Calcula o Checksum de integridade do arquivo.
     * O algoritmo identificado segue uma soma ponderada de bytes (Adler-32 simplificado).
     * @param data Dados antes da cifragem ou após a decifragem.
     * @returns Valor do Checksum de 32 bits.
     */
    public static calculateChecksum(data: Uint8Array): number {
        let sum1 = 1;
        let sum2 = 0;
        const MOD_ADLER = 65521;

        for (let i = 0; i < data.length; i++) {
            sum1 = (sum1 + data[i]) % MOD_ADLER;
            sum2 = (sum2 + sum1) % MOD_ADLER;
        }

        return ((sum2 << 16) | sum1) >>> 0;
    }
}

/**
 * Exemplo de como reconstruir um arquivo .prst:
 * 1. Receber o array JSON do usuário.
 * 2. Extrair os primeiros 4 bytes (Seed).
 * 3. Inicializar MatriboxCrypto(seed).
 * 4. Transformar o restante dos bytes.
 * 5. Validar com calculateChecksum.
 */

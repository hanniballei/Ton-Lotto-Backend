// 邀请码生成器
export function invitationCodeGenerator(id: number): string {
    const alphabet_mid: string = "aVmkpDnZtb";
    const alphabet_edge: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const sumNumber: string = String(id + 1234567890);
    let middle_code: string = "";

    for (let char of sumNumber) {
        const digit: number = parseInt(char);
        middle_code += alphabet_mid[digit];
    }

    const randomEdgeChar = () => alphabet_edge[Math.floor(Math.random() * alphabet_edge.length)];
    const invitation_code: string = randomEdgeChar() + middle_code + randomEdgeChar();

    return invitation_code;
}


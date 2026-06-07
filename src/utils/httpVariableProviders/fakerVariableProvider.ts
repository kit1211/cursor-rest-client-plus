import { faker } from '@faker-js/faker';
import { TextDocument } from 'vscode';
import * as Constants from '../../common/constants';
import { ResolveWarningMessage } from '../../models/httpVariableResolveResult';
import { VariableType } from '../../models/variableType';
import { HttpVariable, HttpVariableContext, HttpVariableProvider } from './httpVariableProvider';

type FakerGenerator = () => string;

const FAKER_GENERATORS: Record<string, FakerGenerator> = {
    fullName: () => faker.person.fullName(),
    firstName: () => faker.person.firstName(),
    lastName: () => faker.person.lastName(),
    email: () => faker.internet.email(),
    phone: () => faker.phone.number(),
    uuid: () => faker.string.uuid(),
    datetime: () => faker.date.recent().toISOString(),
    date: () => faker.date.recent().toISOString().slice(0, 10),
    city: () => faker.location.city(),
    country: () => faker.location.country(),
    company: () => faker.company.name(),
    word: () => faker.lorem.word(),
    url: () => faker.internet.url(),
    ipv4: () => faker.internet.ipv4(),
    password: () => faker.internet.password(),
    boolean: () => String(faker.datatype.boolean()),
};

export class FakerVariableProvider implements HttpVariableProvider {

    private readonly fakerRegex = /^\$faker\s+(\w+)(?:\s+(-?\d+)\s+(-?\d+))?$/;

    private static _instance: FakerVariableProvider;

    public static get Instance(): FakerVariableProvider {
        if (!this._instance) {
            this._instance = new FakerVariableProvider();
        }

        return this._instance;
    }

    public readonly type: VariableType = VariableType.System;

    public async has(name: string): Promise<boolean> {
        return name.startsWith(Constants.FakerVariableName);
    }

    public async get(name: string, _document: TextDocument, _context: HttpVariableContext): Promise<HttpVariable> {
        const match = this.fakerRegex.exec(name.trim());
        if (!match) {
            return { name, warning: ResolveWarningMessage.IncorrectFakerVariableFormat };
        }

        const [, type, min, max] = match;

        if (type === 'int' || type === 'number') {
            const minNum = min !== undefined ? Number(min) : 0;
            const maxNum = max !== undefined ? Number(max) : 10_000;
            if (minNum < maxNum) {
                return { name, value: faker.number.int({ min: minNum, max: maxNum }).toString() };
            }

            return { name, warning: ResolveWarningMessage.IncorrectFakerVariableFormat };
        }

        const generator = FAKER_GENERATORS[type];
        if (!generator) {
            return { name, warning: ResolveWarningMessage.FakerTypeNotExist };
        }

        return { name, value: generator() };
    }

    public async getAll(): Promise<HttpVariable[]> {
        return Object.keys(FAKER_GENERATORS).map(name => ({ name: `${Constants.FakerVariableName} ${name}` }));
    }
}

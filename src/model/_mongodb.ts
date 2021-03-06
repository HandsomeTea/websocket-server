import { Types, SchemaDefinition, FilterQuery, UpdateQuery, QueryOptions, UpdateWithAggregationPipeline, SchemaDefinitionType, Model, AnyKeys, IndexOptions } from 'mongoose';
import mongodb from '@/tool/mongodb';

/**
 * 关于collection的删除
 * 如果collection不存在，直接删除mongoose会抛错，需要判断这个collection的存在性，或者使用try-catch处理
 * 如果一个collection有索引，删除这个collection时要删除其Model，不然删不掉，如：
 *      await db.dropCollection(`${tenantId}_users`);
 *      await db.deleteModel(`${tenantId}_users`);
 */
export default class MongoBase<CM>{
    public tenantId: string | undefined;
    private collectionName: string;
    private schemaModel: SchemaDefinition<SchemaDefinitionType<CM>>;
    private index: { [key: string]: IndexOptions } | undefined;

    /**
     * Creates an instance of MongoBase.
     * @param {string} collectionName mongodb的集合(表)名称，如果分租户，则不应该包含租户tenantId
     * @param {SchemaDefinition<SchemaDefinitionType<CM>>} model mongodb的集合(表)结构
     * @param {{ [key: string]: IndexOptions }} [_index] mongodb的集合(表)索引
     * @param {string} [_tenantId] mongodb的集合(表)如果分租户，则表示该集合(表)属于哪个tenantId(集合/表的前缀)
     * @memberof MongoBase
     */
    constructor(collectionName: string, model: SchemaDefinition<SchemaDefinitionType<CM>>, _index?: { [key: string]: IndexOptions }, _tenantId?: string) {
        this.tenantId = _tenantId;
        this.collectionName = collectionName;
        this.schemaModel = model;
        this.index = _index;
    }

    private get model(): Model<CM> {
        if (global.tenantDBModel[this.collectionName]) {
            return global.tenantDBModel[this.collectionName].data;
        }
        const _schema = new mongodb.schema(this.schemaModel, { _id: false, versionKey: false, timestamps: { createdAt: true, updatedAt: true } });

        if (this.index) {
            for (const key in this.index) {
                _schema.index({ [key]: 1 }, this.index[key]);
            }
        }
        const model = mongodb.server.model(this.collectionName, _schema, this.collectionName);

        if (!this.tenantId) {
            return model;
        }
        global.tenantDBModel[this.collectionName] = {
            data: model,
            timer: setTimeout(() => {
                clearTimeout(global.tenantDBModel[this.collectionName].timer);
                delete global.tenantDBModel[this.collectionName];
            }, 30 * 60 * 1000)
        };
        return global.tenantDBModel[this.collectionName].data;
    }

    private id(data: AnyKeys<CM> | Array<AnyKeys<CM>>): Array<AnyKeys<CM & { _id: string }>> {
        const result: Array<AnyKeys<CM & { _id: string }>> = [];

        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if (typeof data[i]._id !== 'string' || typeof data[i]._id === 'string' && data[i]._id?.trim() === '') {
                    result.push({
                        ...data[i],
                        _id: new Types.ObjectId().toString()
                    });
                }
            }
        } else {
            result.push({
                ...data,
                _id: new Types.ObjectId().toString()
            });
        }

        return result;
    }

    async create(data: CM | Array<CM>): Promise<CM | Array<CM>> {
        if (Array.isArray(data)) {
            return await this.model.insertMany(this.id(data));
        } else {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return await new this.model(this.id(data)[0]).save();
        }
    }

    async removeOne(query: FilterQuery<CM>): Promise<{ deletedCount: number }> {
        return await this.model.deleteOne(query);
    }

    async removeMany(query: FilterQuery<CM>): Promise<{ deletedCount: number }> {
        return await this.model.deleteMany(query);
    }

    async updateOne(query: FilterQuery<CM>, update: UpdateQuery<CM> | UpdateWithAggregationPipeline, options?: QueryOptions): Promise<{
        acknowledged: boolean
        modifiedCount: number
        upsertedId: null | string
        upsertedCount: number
        matchedCount: number
    }> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return await this.model.updateOne(query, update, options);
    }

    /**upsert尽量不要触发insert，否则会生成一个ObjectId构建的_id，除非指定一个_id，并且collection里面的default默认设置的字段也不会有 */
    async upsertOne(query: FilterQuery<CM>, update: UpdateQuery<CM> | UpdateWithAggregationPipeline, options?: QueryOptions): Promise<{
        acknowledged: boolean
        modifiedCount: number
        upsertedId: null | string
        upsertedCount: number
        matchedCount: number
    }> {
        return await this.updateOne(query, update, { ...options, upsert: true });
    }

    async updateMany(query: FilterQuery<CM>, update: UpdateQuery<CM> | UpdateWithAggregationPipeline, options?: QueryOptions): Promise<{
        acknowledged: boolean
        modifiedCount: number
        upsertedId: null | string
        upsertedCount: number
        matchedCount: number
    }> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return await this.model.updateMany(query, update, options);
    }

    /**upsert尽量不要触发insert，否则会生成一个ObjectId构建的_id，除非指定_id，并且collection里面的default默认设置的字段也不会有 */
    async upsertMany(query: FilterQuery<CM>, update: UpdateQuery<CM> | UpdateWithAggregationPipeline, options?: QueryOptions): Promise<{
        acknowledged: boolean
        modifiedCount: number
        upsertedId: null | string
        upsertedCount: number
        matchedCount: number
    }> {
        return await this.updateMany(query, update, { ...options, upsert: true });
    }

    async find(query?: FilterQuery<CM>, options?: QueryOptions): Promise<Array<CM>> {
        return await this.model.find(query || {}, null, options).lean();
    }

    async findOne(query: FilterQuery<CM>, options?: QueryOptions): Promise<CM | null> {
        return await this.model.findOne(query, null, options).lean();
    }

    async findById(_id: string, options?: QueryOptions): Promise<CM | null> {
        return await this.model.findById(_id, null, options).lean();
    }

    async paging(query: FilterQuery<CM>, limit: number, skip: number, sort?: Record<string, 'asc' | 'desc' | 'ascending' | 'descending' | '1' | '-1'>, options?: QueryOptions): Promise<Array<CM>> {
        return await this.model.find(query, null, options).sort(sort).skip(skip || 0).limit(limit).lean();
    }

    async count(query?: FilterQuery<CM>): Promise<number> {
        if (query) {
            return await this.model.countDocuments(query);
        } else {
            return await this.model.estimatedDocumentCount();
        }
    }

    get aggregate() {
        return this.model.aggregate;
    }
}

#include <wasm.c>
#include <musl/time/mktime.c>


#define MINIZ_LITTLE_ENDIAN 1

struct stat {
  time_t st_mtime;
};

extern int js_stat(const char* filename, double* st_mtime);
int stat(const char* filename, struct stat* st);
int stat(const char* filename, struct stat* st) {
    double m_time;
    int ret = js_stat(filename, &m_time);
    if (!ret) {
        if (st) {
            st->st_mtime = DOUBLE_TO_U64(m_time);
        }
    }
    return ret;
}


#include <zip/miniz.c>

extern void initialize(int, int, int);
static uintptr_t heapStart;
static int errNo;

static uint8_t* data_ptr;
static uint64_t data_length;

static char* EMPTY_STRING = "";

typedef struct {
    bool is_directory;
    bool is_encrypted;
    char* name;
    time_t last_modified;
    size_t index;
    uint64_t size;
} ZipperFileInfo;

typedef struct {
    bool file_prepared;
    ZipperFileInfo* file_infos;
    size_t file_info_count;
    mz_zip_archive* miniz;
} Zipper;


typedef enum {
    SUCCESS = 0,

    NO_FILE_PREPARED = 1,
    FILE_INIT_FAILED = 2,
    OUT_OF_MEMORY = 3,
    FILE_INFOS_ALREADY_RETRIEVED = 4,
    STAT_FAILED = 5,
    EXTRACTION_FAILED = 6,
    INDEX_OUT_OF_BOUNDS = 7
} ZipperError;

EXPORT ZipperError zipper_get_nth_file_info_fields(Zipper* zipper, size_t index,
        bool* is_directory, bool* is_encrypted, char** name, double* last_modified,
        double* size, size_t* retval_index, ZipperFileInfo** entry_ptr) ;
EXPORT ZipperError zipper_extract_file(Zipper* zipper, ZipperFileInfo* file_info);
static size_t write_callback(void* file_handle, uint64_t file_offset, const void* buffer, size_t buffer_length);
EXPORT ZipperError zipper_populate_file_infos(Zipper* zipper, size_t* file_info_count);
EXPORT ZipperError zipper_prepare_file_for_reading(Zipper* zipper, const char *pFilename);
EXPORT Zipper* init_zipper(void);

int main() {
    // Sanity checks
    uint8_t bytes[10];
    for (int i = 0; i < 10; ++i) {
        bytes[i] = i;
    }

    if (*((uint32_t*)(&bytes[4])) != 117835012) {
        printf("buggy wasm compiler");
        abort();
    }

    int dummy;
    heapStart = (uintptr_t)(&dummy) + (uintptr_t)(4);
    initialize(heapStart, DEBUG, STACK_SIZE);

    data_length = 1024 * 1024 * 20;
    data_ptr = malloc(data_length);
    if (!data_ptr) {
        printf("Failed to allocate %llu bytes", data_length);
        abort();
    }
}

EXPORT int* __errno_location() {
    return &errNo;
}

EXPORT Zipper* init_zipper() {
    Zipper* zipper = malloc(sizeof(Zipper));
    if (!zipper) {
        return 0;
    }
    zipper->file_prepared = false;
    zipper->file_infos = 0;
    zipper->file_info_count = 0;
    mz_zip_archive* miniz = malloc(sizeof(mz_zip_archive));
    if (!miniz) {
        return 0;
    }
    zipper->miniz = miniz;
    return zipper;
}

EXPORT ZipperError zipper_prepare_file_for_reading(Zipper* zipper, const char *pFilename) {
    if (zipper->file_info_count > 0) {
        for (int i = 0; i < zipper->file_info_count; ++i) {
            ZipperFileInfo* file_info = &zipper->file_infos[i];
            if (file_info->name != EMPTY_STRING) {
                free(file_info->name);
            }
            file_info->name = 0;
        }
        free(zipper->file_infos);
        zipper->file_infos = 0;
        zipper->file_info_count = 0;
    }
    memset(zipper->miniz, 0, sizeof(mz_zip_archive));
    zipper->file_prepared = false;
    zipper->file_infos = 0;
    zipper->file_info_count = 0;

    if (!mz_zip_reader_init_file(zipper->miniz, pFilename, MZ_ZIP_FLAG_DO_NOT_SORT_CENTRAL_DIRECTORY)) {
        return FILE_INIT_FAILED;
    }

    zipper->file_prepared = true;
    return SUCCESS;
}


EXPORT ZipperError zipper_populate_file_infos(Zipper* zipper, size_t* file_info_count) {
    *file_info_count = 0;
    if (!zipper->file_prepared) {
        return NO_FILE_PREPARED;
    }

    if (zipper->file_info_count > 0) {
        return FILE_INFOS_ALREADY_RETRIEVED;
    }

    size_t total_files = mz_zip_reader_get_num_files(zipper->miniz);
    if (total_files == 0) {
        return SUCCESS;
    }

    ZipperFileInfo* file_infos = malloc(total_files * sizeof(ZipperFileInfo));

    if (!file_infos) {
        return OUT_OF_MEMORY;
    }

    zipper->file_infos = file_infos;
    zipper->file_info_count = total_files;

    mz_zip_archive_file_stat stat;
    for (size_t index = 0; index < total_files; ++index) {
        ZipperFileInfo* file_info = &zipper->file_infos[index];
        file_info->index = index;
        size_t name_length = mz_zip_reader_get_filename(zipper->miniz, index, 0, 0);
        if (!name_length) {
            file_info->name = EMPTY_STRING;
        } else {
            char* name = malloc(name_length);
            if (!name) {
                return OUT_OF_MEMORY;
            }
            mz_zip_reader_get_filename(zipper->miniz, index, name, name_length);
            file_info->name = name;
        }

        file_info->is_directory = mz_zip_reader_is_file_a_directory(zipper->miniz, index);
        file_info->is_encrypted = mz_zip_reader_is_file_encrypted(zipper->miniz, index);
        if (!mz_zip_reader_file_stat(zipper->miniz, index, &stat)) {
            return STAT_FAILED;
        }
        file_info->size = stat.m_uncomp_size;
        file_info->last_modified = stat.m_time;
    }

    *file_info_count = zipper->file_info_count;
    return SUCCESS;
}

EXPORT ZipperError zipper_get_nth_file_info_fields(Zipper* zipper, size_t index,
        bool* is_directory, bool* is_encrypted, char** name, double* last_modified,
        double* size, size_t* retval_index, ZipperFileInfo** entry_ptr) {
    if (!zipper->file_prepared) {
        return NO_FILE_PREPARED;
    }

    if (index >= zipper->file_info_count) {
        return INDEX_OUT_OF_BOUNDS;
    }

    ZipperFileInfo* entry = &zipper->file_infos[index];
    *is_directory = entry->is_directory;
    *is_encrypted = entry->is_encrypted;
    *name = entry->name;
    *last_modified = CLIP_I64_TO_DOUBLE(entry->last_modified);
    *size = CLIP_I64_TO_DOUBLE(entry->size);
    *retval_index = entry->index;
    *entry_ptr = entry;
    return SUCCESS;
}


extern size_t js_write_callback(Zipper* zipper,
                                double file_offset,
                                const void* buffer,
                                size_t buffer_length,
                                uint8_t* wasm_data_ptr);

static size_t write_callback(void* zipper, uint64_t file_offset, const void* buffer, size_t buffer_length) {
    double file_offset_d = CLIP_I64_TO_DOUBLE(file_offset);
    return js_write_callback(zipper, file_offset_d, buffer, buffer_length, data_ptr);
}

EXPORT ZipperError zipper_extract_file(Zipper* zipper, ZipperFileInfo* file_info) {
    if (file_info->size > data_length) {
        if (file_info->size >= UINT_MAX) {
            return OUT_OF_MEMORY;
        }

        data_length = 0;
        void* realloced = realloc(data_ptr, (uint32_t) file_info->size);
        if (!realloced) {
            free(data_ptr);
            data_ptr = 0;
            return OUT_OF_MEMORY;
        }
        data_ptr = realloced;
        data_length = (uint32_t) file_info->size;
    }

    if (!mz_zip_reader_extract_to_callback(zipper->miniz, file_info->index, write_callback, zipper, MZ_ZIP_FLAG_DO_NOT_SORT_CENTRAL_DIRECTORY)) {
        return EXTRACTION_FAILED;
    }
    return SUCCESS;
}
